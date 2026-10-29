import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
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
      await this.prisma.mediaAsset.update({ where: { id: assetId }, data: { body: { thumbPath: thumbRel } as never } }).catch(() => undefined);
    } catch {
      // ffmpeg 缺失或格式不支持时不阻断上传，缩略图留空
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
    const { size } = await stat(outAbs);
    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { storagePath: outRel, body: { transcoded: true } as never },
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
