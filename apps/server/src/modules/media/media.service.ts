import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const run = promisify(execFile);

const KIND_BY_MIME: Array<[RegExp, string]> = [
  [/^image\//, 'image'],
  [/^video\//, 'video'],
  [/^audio\//, 'audio'],
];

export function kindOf(mime: string): string {
  for (const [re, kind] of KIND_BY_MIME) if (re.test(mime)) return kind;
  return 'doc';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(file: Express.Multer.File): Promise<unknown> {
    if (!file || !file.buffer?.length) throw new BadRequestException('文件为空');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existed = await this.prisma.mediaAsset.findUnique({ where: { sha256 } });
    if (existed) return { ...existed, duplicated: true };

    const kind = kindOf(file.mimetype);
    const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
    const now = new Date();
    const relDir = `${kind}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storagePath = await this.storage.save(file.buffer, relDir, `${sha256.slice(0, 16)}.${ext}`);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        kind,
        storagePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        sha256,
      },
    });
    await this.makeThumb(asset.id, storagePath, kind);
    if (kind === 'video') await this.autoTranscode(asset.id, storagePath);
    return this.prisma.mediaAsset.findUnique({ where: { id: asset.id } });
  }

  /** 缩略图（ED-03）：图片/视频均由 ffmpeg 生成，统一 320px 宽 */
  private async makeThumb(assetId: string, storagePath: string, kind: string): Promise<void> {
    if (!['image', 'video'].includes(kind)) return;
    const abs = resolve(this.storage.rootDir, storagePath);
    const thumbRel = storagePath.replace(/\.[^.]+$/, '_thumb.jpg');
    const thumbAbs = resolve(this.storage.rootDir, thumbRel);
    try {
      const args = kind === 'video' ? ['-ss', '1', '-i', abs, '-frames:v', '1'] : ['-i', abs];
      args.push('-vf', 'scale=320:-1', '-y', thumbAbs);
      await run(ffmpegPath(), args, { timeout: 120_000 });
      // 多尺寸（ED-03）：再出一张 1280px 宽的大图预览档
      const lgRel = storagePath.replace(/\.[^.]+$/, '_lg.jpg');
      const lgAbs = resolve(this.storage.rootDir, lgRel);
      const argsLg = kind === 'video' ? ['-ss', '1', '-i', abs, '-frames:v', '1'] : ['-i', abs];
      argsLg.push('-vf', 'scale=1280:-1', '-y', lgAbs);
      await run(ffmpegPath(), argsLg, { timeout: 120_000 }).catch(() => undefined);
      await this.prisma.mediaAsset.update({ where: { id: assetId }, data: { body: { thumbPath: thumbRel, thumbPathLg: lgRel } as never } }).catch(() => undefined);
    } catch {
      // ffmpeg 缺失或格式不支持时不阻断上传，缩略图留空
    }
  }

  /** 上传统一转码（ED-07）：非 H.264 视频自动转 H.264/AAC + faststart；已是 h264 原样保留 */
  private async autoTranscode(assetId: string, storagePath: string): Promise<void> {
    const abs = resolve(this.storage.rootDir, storagePath);
    try {
      const probe = await run(
        ffprobePath(),
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', abs],
        { timeout: 30_000 },
      );
      if (String(probe.stdout).trim() === 'h264') return;
    } catch {
      return; // 探测失败保留原件，可用手动转码兜底
    }
    const outRel = storagePath.replace(/\.([^.]+)$/, '_t.mp4');
    const outAbs = resolve(this.storage.rootDir, outRel);
    try {
      await run(
        ffmpegPath(),
        ['-i', abs, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outAbs],
        { timeout: 30 * 60_000 },
      );
    } catch {
      return; // 转码失败保留原件不阻断上传
    }
    // 转码产物替换原件：重算 sha256 与大小，保证终端下载校验一致
    const [{ size }, buf] = await Promise.all([stat(outAbs), readFile(outAbs)]);
    try {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          storagePath: outRel,
          sizeBytes: size,
          sha256: createHash('sha256').update(buf).digest('hex'),
          mimeType: 'video/mp4',
          body: { transcoded: true } as never,
        },
      });
    } catch {
      // 转码产物 sha 与库内既有记录冲突（如同内容重复上传）：保留原件，人工转码兜底
    }
  }

  /** MP4 统一转码（ED-07）：H.264/AAC + faststart，转码产物另存并关联 */
  async transcode(mediaId: string): Promise<unknown> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('素材不存在');
    if (asset.kind !== 'video') throw new BadRequestException('仅视频素材需要转码');
    const abs = resolve(this.storage.rootDir, asset.storagePath);
    await stat(abs);
    const outRel = asset.storagePath.replace(/\.([^.]+)$/, '_t.mp4');
    const outAbs = resolve(this.storage.rootDir, outRel);
    try {
      await run(
        ffmpegPath(),
        ['-i', abs, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outAbs],
        { timeout: 30 * 60_000 },
      );
    } catch {
      throw new ServiceUnavailableException('转码失败：请确认服务端已安装 ffmpeg（容器镜像已内置）');
    }
    const [{ size }, buf] = await Promise.all([stat(outAbs), readFile(outAbs)]);
    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        storagePath: outRel,
        sizeBytes: size,
        sha256: createHash('sha256').update(buf).digest('hex'),
        mimeType: 'video/mp4',
        body: { transcoded: true } as never,
      },
    });
    return { ...updated, sizeBytes: size };
  }

  async list(query: { kind?: string; page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 24);
    const where = {
      kind: query.kind || undefined,
      originalName: query.keyword ? { contains: query.keyword } : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      total,
      items: items.map((m) => ({ ...m, url: this.storage.urlFor(m.storagePath) })),
    };
  }

  /** 引用保护（CM-04）：被内容引用的素材禁止删除 */
  async remove(id: string): Promise<{ ok: boolean; message?: string }> {
    const refCount = await this.prisma.content.count({ where: { mediaId: id } });
    if (refCount > 0) return { ok: false, message: `素材被 ${refCount} 条内容引用，无法删除` };
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { ok: true };
  }
}

/** 优先使用系统 ffmpeg（PATH），否则报错提示 */
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
function ffprobePath(): string {
  return process.env.FFPROBE_PATH || 'ffprobe';
}
