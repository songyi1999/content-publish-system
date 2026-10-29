import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * 本地磁盘媒体存储（方案约定不引入对象存储组件）。
 * 根目录由 MEDIA_ROOT 指定，容器部署时挂载为卷；对外经 /media 前缀静态服务。
 */
@Injectable()
export class StorageService {
  readonly rootDir: string;

  constructor() {
    this.rootDir = resolve(process.env.MEDIA_ROOT || './data/media');
  }

  /** 保存文件，返回相对根目录的 POSIX 风格路径 */
  async save(buffer: Buffer, relDir: string, filename: string): Promise<string> {
    const dir = resolve(this.rootDir, relDir);
    if (dir !== this.rootDir && !dir.startsWith(this.rootDir + sep)) {
      throw new Error('非法存储路径');
    }
    await mkdir(dir, { recursive: true });
    const abs = join(dir, filename);
    await writeFile(abs, buffer);
    return relative(this.rootDir, abs).split(sep).join('/');
  }

  urlFor(relPath: string): string {
    return `/media/${relPath}`;
  }
}
