import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, statSync } from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PublishService } from '../publish/publish.service';
import { Public } from '../../common/auth.guard';

const BASE_FALLBACK = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

/** 终端侧接口（deviceKey 鉴权）：激活 / 清单 / 断点续传下载 / 上报 / 截屏 */
@Controller('device-api')
export class DeviceApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: PublishService,
    private readonly storage: StorageService,
  ) {}

  private async deviceBy(key?: string) {
    if (!key) throw new BadRequestException('缺少 x-device-key');
    const device = await this.prisma.device.findUnique({ where: { deviceKey: key } });
    if (!device || !device.enabled) throw new NotFoundException('设备未注册或已禁用');
    return device;
  }

  @Post('activate')
  @Public()
  async activate(@Body() body: { activateCode: string }, @Headers('x-forwarded-for') ip?: string) {
    return this.publish.activate(body.activateCode, ip);
  }

  /** 客户端版本检查（TC-09）：返回最新版本与下载地址 */
  @Get('version')
  @Public()
  version(@Headers('x-device-key') key?: string, @Headers('x-app-version') appVersion?: string) {
    const latest = process.env.CLIENT_LATEST_VERSION || '0.1.0';
    const apkUrl = process.env.CLIENT_APK_URL || '';
    const exeUrl = process.env.CLIENT_EXE_URL || '';
    return { latest, apkUrl, exeUrl, upToDate: !appVersion || appVersion >= latest };
  }

  @Get('manifest')
  @Public()
  async manifest(@Headers('x-device-key') key?: string) {
    const device = await this.deviceBy(key);
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return this.publish.manifest(device.id, BASE_FALLBACK);
  }

  /** 媒体下载：支持 HTTP Range 断点续传（PB-08/R2） */
  @Get('download/:mediaId')
  @Public()
  async download(@Param('mediaId') mediaId: string, @Res() res: Response, @Headers('range') range?: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('素材不存在');
    const abs = this.publish.mediaAbsPath(media.storagePath);
    const size = statSync(abs).size;
    const mime = media.mimeType || 'application/octet-stream';
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('ETag', `"${media.sha256 ?? media.id}"`);

    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (!m) {
        res.status(416).end();
        return;
      }
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      createReadStream(abs, { start, end }).pipe(res);
      return;
    }
    res.setHeader('Content-Length', size);
    createReadStream(abs).pipe(res);
  }

  /** 终端事件上报：下载完成 / 播放开始 / 更新结果（LG-04） */
  @Post('report')
  @Public()
  async report(@Headers('x-device-key') key: string, @Body() body: { event: string; detail?: Record<string, unknown> }) {
    const device = await this.deviceBy(key);
    await this.prisma.auditLog.create({
      data: { action: `TERMINAL_${body.event}`, targetType: 'device', targetId: device.id, detail: body.detail as never },
    });
    if (body.event === 'DOWNLOAD_DONE') {
      await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }
    return { ok: true };
  }

  /** 监播截图上传（R14/DV-12）：保存 + 平均哈希比对（黑屏/静止初筛在服务端做） */
  @Post('screenshot')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  async screenshot(@Headers('x-device-key') key: string, @UploadedFile() file: Express.Multer.File) {
    const device = await this.deviceBy(key);
    if (!file?.buffer) throw new BadRequestException('文件为空');
    const rel = await this.storage.save(file.buffer, `screenshots/${device.code}`, `${Date.now()}.jpg`);
    const prev = await this.prisma.screenshotLog.findFirst({
      where: { deviceId: device.id, ahash: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    const { ahash, black } = await analyzeImage(file.buffer);
    let anomaly: string | null = null;
    if (black) anomaly = 'BLACK_SCREEN';
    else if (ahash && prev?.ahash && hamming(ahash, prev.ahash) <= 1) anomaly = 'STATIC_FRAME';
    await this.prisma.screenshotLog.create({ data: { deviceId: device.id, storagePath: rel, ahash, anomaly } });
    if (anomaly) {
      await this.prisma.auditLog.create({
        data: { action: `SCREENSHOT_ANOMALY_${anomaly}`, targetType: 'device', targetId: device.id, detail: { path: rel } as never },
      });
    }
    return { ok: true, anomaly };
  }
}

/** aHash：ffmpeg 解码为 8x8 灰度 → 均值阈值化；同时返回黑屏判定（均值<8 视为黑屏） */
import { spawn } from 'node:child_process';

function analyzeImage(buf: Buffer): Promise<{ ahash: string | null; black: boolean }> {
  return new Promise((done) => {
    try {
      const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-f', 'image2pipe', '-i', 'pipe:0',
        '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
      ]);
      const chunks: Buffer[] = [];
      p.stdout.on('data', (c: Buffer) => chunks.push(c));
      p.on('error', () => done({ ahash: null, black: false }));
      p.on('close', () => {
        const gray = Buffer.concat(chunks);
        if (gray.length < 64) return done({ ahash: null, black: false });
        const avg = gray.reduce((s, v) => s + v, 0) / gray.length;
        let bits = '';
        for (let i = 0; i < 64; i++) bits += gray[i] > avg ? '1' : '0';
        done({ ahash: parseInt(bits, 2).toString(16).padStart(16, '0'), black: avg < 8 });
      });
      p.stdin.end(buf);
    } catch {
      done({ ahash: null, black: false });
    }
  });
}

function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d;
}
