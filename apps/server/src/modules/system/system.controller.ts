import { BadRequestException, Body, Controller, Get, OnModuleDestroy, OnModuleInit, Post, Put, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotifyService } from '../../common/notify.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

const run = promisify(execFile);

/** 系统参数白名单（SY-01） */
const PARAM_KEYS = [
  'aiReviewEnabled',
  'alertEnabled',
  'downloadRateMbps',
  'latestVersion',
  'stableVersion',
  'grayGroupIds',
  'downloadWindow',
  'passwordPolicy',
  'review',
  'scheduleOverlap',
  'storageAlertFreeMB',
  'backupAutoEnabled',
] as const;

@Controller('system')
export class SystemController implements OnModuleInit, OnModuleDestroy {
  private backupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  /** 自动备份（SY-02）：开启后每小时做一次快照归档（auto-*.sql），保留 7 天 */
  onModuleInit(): void {
    this.backupTimer = setInterval(() => void this.autoBackupTick(), 3600_000);
  }

  onModuleDestroy(): void {
    if (this.backupTimer) clearInterval(this.backupTimer);
  }

  private async autoBackupTick(): Promise<void> {
    try {
      const row = await this.prisma.appParam.findUnique({ where: { key: 'backupAutoEnabled' } }).catch(() => undefined);
      if (!(row?.value as { enabled?: boolean })?.enabled) return;
      const dir = resolve(process.env.BACKUP_DIR || './data/backups');
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      const file = `auto-${stamp}.sql`;
      await run('pg_dump', [process.env.DATABASE_URL || '', '-f', resolve(dir, file)], { timeout: 10 * 60_000, shell: false } as never).catch(async () => {
        // 容器内 DATABASE_URL 传参形式不兼容时退回 env 方式
        await run('sh', ['-c', `pg_dump "$DATABASE_URL" -f "${resolve(dir, file)}"`], { timeout: 10 * 60_000 });
      });
      // 清理 7 天前的自动备份
      const files = await readdir(dir).catch(() => [] as string[]);
      const cutoff = Date.now() - 7 * 24 * 3600_000;
      for (const f of files) {
        if (!f.startsWith('auto-')) continue;
        const st = await stat(resolve(dir, f)).catch(() => undefined);
        if (st && st.mtime.getTime() < cutoff) await rm(resolve(dir, f)).catch(() => undefined);
      }
      void this.notify.send({ key: `autobackup:${file}`, content: `【内容发布系统】自动备份完成：${file}` });
    } catch {
      /* 自动备份失败不影响主流程 */
    }
  }

  @Get('params')
  async params(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.appParam.findMany({ where: { key: { in: PARAM_KEYS as unknown as string[] } } });
    const out: Record<string, unknown> = {};
    for (const k of PARAM_KEYS) out[k] = null;
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  @Put('params')
  @Roles('admin')
  async setParams(@Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    const data = Object.entries(body).filter(([k]) => (PARAM_KEYS as readonly string[]).includes(k));
    if (data.length === 0) throw new BadRequestException('无可识别的参数');
    for (const [key, value] of data) {
      await this.prisma.appParam.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    }
    await this.audit.log({ userId: me.sub, action: 'PARAM_UPDATE', detail: Object.fromEntries(data) });
    return { ok: true };
  }

  /** 数据库备份（SY-02）：pg_dump → data/backups，完成后 webhook 通知 */
  @Post('backup')
  @Roles('admin')
  async backup(@CurrentUser() me: JwtUser) {
    const dir = resolve(process.env.BACKUP_DIR || './data/backups');
    await mkdir(dir, { recursive: true });
    const file = `cps-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.sql`;
    const out = resolve(dir, file);
    const dbUrl = process.env.DATABASE_URL!;
    const cmd = process.env.PG_DUMP_PATH || 'pg_dump';
    try {
      await new Promise<void>((done, reject) => {
        const p = spawn(cmd, [`--dbname=${dbUrl}`, '--file', out], { stdio: 'ignore' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? done() : reject(new Error(`pg_dump exit ${code}`))));
      });
    } catch (e) {
      throw new ServiceUnavailableException(`备份失败：${(e as Error).message}（宿主机需安装 pg_dump，或在数据库容器内执行，见部署手册）`);
    }
    const { size } = await stat(out);
    await this.audit.log({ userId: me.sub, action: 'SYSTEM_BACKUP', detail: { file, size } });
    void this.notify.send({ key: `backup:${file}`, content: `【内容发布系统】数据库备份完成：${file}（${(size / 1024 / 1024).toFixed(1)}MB）` });
    return { ok: true, file, sizeBytes: size };
  }

  @Get('backups')
  async listBackups(): Promise<Array<{ name: string; sizeBytes: number }>> {
    const dir = resolve(process.env.BACKUP_DIR || './data/backups');
    try {
      const names = await readdir(dir);
      const out: Array<{ name: string; sizeBytes: number }> = [];
      for (const name of names.filter((n) => n.endsWith('.sql'))) {
        const { size } = await stat(resolve(dir, name));
        out.push({ name, sizeBytes: size });
      }
      return out.sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  /** 告警通道测试 */
  @Post('alert-test')
  @Roles('admin')
  async alertTest() {
    await this.notify.send({ key: `test:${Date.now()}`, content: '【内容发布系统】告警通道测试消息（管理端触发）' });
    return { ok: true, enabled: this.notify.enabled };
  }
}

/** 运营统计（SY-04） */
@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const [users, contents, byStatus, devices, tasks, anomalies, published7d] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.content.count(),
      this.prisma.content.groupBy({ by: ['status'], _count: true } as never),
      this.prisma.device.findMany({ select: { code: true } }),
      this.prisma.publishTask.groupBy({ by: ['status'], _count: true } as never),
      this.prisma.screenshotLog.count({ where: { anomaly: { not: null } } }),
      this.prisma.content.count({ where: { status: 'PUBLISHED', updatedAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
    ]);
    return {
      users,
      contents,
      contentsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      devices: devices.length,
      tasksByStatus: Object.fromEntries(tasks.map((r) => [r.status, r._count])),
      screenshotAnomalies: anomalies,
      publishedIn7d: published7d,
    };
  }
}
