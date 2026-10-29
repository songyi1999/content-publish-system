import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { PlayableItem, Program, ScheduleSlot } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DevicesGateway } from '../devices/devices.gateway';

const TICK_MS = 15_000;
const TERMINAL_PUBLIC_BASE = process.env.TERMINAL_PUBLIC_BASE || '';

@Injectable()
export class PublishService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gateway: DevicesGateway,
  ) {}

  /* ---------------- 管理端：任务创建与撤回 ---------------- */

  async createTask(
    body: { contentId?: string; contentIds?: string[]; targetType: 'ALL' | 'GROUP' | 'DEVICE'; targetIds?: string[]; mode?: 'now' | 'scheduled'; startAt?: string },
    actorId?: string,
  ) {
    // PB-04 批量发布：多条内容组成发布单（同 batchId），可整批撤回
    const ids = body.contentIds?.length ? body.contentIds : body.contentId ? [body.contentId] : [];
    if (ids.length === 0) throw new BadRequestException('请选择要发布的内容');
    const contents = await this.prisma.content.findMany({ where: { id: { in: ids } } });
    if (contents.length !== ids.length) throw new NotFoundException('存在无效的内容');
    for (const content of contents) {
      if (content.status !== 'APPROVED' && content.status !== 'PUBLISHED') {
        throw new BadRequestException(`仅审核通过的内容可发布（R6 编辑-审核-发布分离）：${content.title}`);
      }
    }
    const batchId = ids.length > 1 ? createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 10) : undefined;
    const executeAt = body.mode === 'scheduled' && body.startAt ? new Date(body.startAt) : new Date();
    const created: Array<{ id: string }> = [];
    for (const contentId of ids) {
      const task = await this.prisma.publishTask.create({
        data: {
          contentId,
          targetType: body.targetType,
          targetIds: body.targetIds ?? [],
          status: executeAt.getTime() > Date.now() ? 'PENDING' : 'DISPATCHED',
          batchId,
        },
      });
      created.push({ id: task.id });
      await this.prisma.content.update({ where: { id: contentId }, data: { status: 'PUBLISHED' } }).catch(() => undefined);
      await this.prisma.auditLog.create({
        data: { userId: actorId, action: 'PUBLISH_CREATE', targetType: 'publishTask', targetId: task.id, detail: { ...body, batchId, executeAt: executeAt.toISOString() } as never },
      });
      if (executeAt.getTime() <= Date.now()) await this.execute(task.id);
      else this.scheduleOnce(executeAt.getTime() - Date.now(), task.id);
    }
    return batchId ? { batchId, ids: created.map((c) => c.id) } : { id: created[0].id };
  }

  /** 手动重发（PB-07）：对未撤回任务重新执行下发 */
  async retryTask(taskId: string, actorId?: string) {
    const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'REVOKED') throw new BadRequestException('已撤回任务不可重发，请重新发布');
    await this.execute(taskId);
    await this.prisma.auditLog.create({ data: { userId: actorId, action: 'PUBLISH_RETRY', targetType: 'publishTask', targetId: taskId } });
    return { ok: true };
  }

  /** 整批撤回（PB-04）：同批次任务全部下架，终端同步删除本地内容 */
  async revokeBatch(batchId: string, actorId?: string) {
    const tasks = await this.prisma.publishTask.findMany({ where: { batchId, status: { not: 'REVOKED' } } });
    if (tasks.length === 0) throw new NotFoundException('批次不存在或已全部撤回');
    for (const task of tasks) await this.revokeTask(task.id, actorId);
    return { ok: true, revoked: tasks.length };
  }

  async revokeTask(taskId: string, actorId?: string) {
    const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    await this.prisma.publishTask.update({ where: { id: taskId }, data: { status: 'REVOKED' } });
    await this.prisma.content.update({ where: { id: task.contentId }, data: { status: 'APPROVED' } }).catch(() => undefined);
    for (const code of await this.resolveTargetCodes(task.targetType, task.targetIds)) {
      this.gateway.sendCommand(code, { id: randomBytes(8).toString('hex'), type: 'unpublish', payload: { contentId: task.contentId }, issuedAt: Date.now() });
    }
    await this.prisma.auditLog.create({ data: { userId: actorId, action: 'PUBLISH_REVOKE', targetType: 'publishTask', targetId: taskId } });
    return { ok: true };
  }

  async listTasks(query: { page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 20);
    const where = { status: query.status || undefined };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.publishTask.count({ where }),
      this.prisma.publishTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { content: { select: { title: true, type: true } } },
      }),
    ]);
    return { total, items };
  }

  /* ---------------- 调度：到期执行 + 失败重试（单节点内调度，扩容时换 BullMQ） ---------------- */

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    for (const t of this.onceTimers.values()) clearTimeout(t);
  }

  private onceTimers = new Map<string, NodeJS.Timeout>();

  private scheduleOnce(delayMs: number, taskId: string): void {
    const t = setTimeout(() => void this.execute(taskId), Math.max(0, delayMs));
    this.onceTimers.set(taskId, t);
  }

  private async tick(): Promise<void> {
    const due = await this.prisma.publishTask.findMany({ where: { status: 'PENDING' } });
    for (const task of due) {
      const created = task.createdAt.getTime();
      if (Date.now() - created >= 0 && this.isDue(task)) await this.execute(task.id);
    }
  }

  private isDue(task: { createdAt: Date }): boolean {
    return Date.now() >= task.createdAt.getTime();
  }

  private async execute(taskId: string): Promise<void> {
    const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } });
    if (!task || task.status === 'DONE' || task.status === 'REVOKED') return;
    const codes = await this.resolveTargetCodes(task.targetType, task.targetIds);
    const perDevice: Record<string, string> = {};
    for (const code of codes) {
      const ok = this.gateway.sendCommand(code, {
        id: randomBytes(8).toString('hex'),
        type: 'publish',
        payload: { taskId, contentId: task.contentId },
        issuedAt: Date.now(),
      });
      perDevice[code] = ok ? 'SENT' : 'QUEUED';
    }
    // 任务即完成：离线终端记 QUEUED，由其上线拉取清单兜底（R2 离线自治）
    await this.prisma.publishTask.update({
      where: { id: taskId },
      data: { status: 'DONE', body: { perDevice } as never },
    });
  }

  private async resolveTargetCodes(targetType: string, targetIds: string[]): Promise<string[]> {
    if (targetType === 'ALL') {
      const all = await this.prisma.device.findMany({ where: { enabled: true }, select: { code: true } });
      return all.map((d) => d.code);
    }
    if (targetType === 'GROUP') {
      const inGroup = await this.prisma.device.findMany({ where: { groupId: { in: targetIds }, enabled: true }, select: { code: true } });
      return inGroup.map((d) => d.code);
    }
    const byId = await this.prisma.device.findMany({ where: { id: { in: targetIds } }, select: { code: true } });
    return byId.map((d) => d.code);
  }

  /* ---------------- 终端侧：激活与内容清单 ---------------- */

  async activate(activateCode: string, ip?: string): Promise<{ deviceKey: string; deviceCode: string }> {
    const device = await this.prisma.device.findFirst({ where: { activateCode, enabled: true } });
    if (!device) throw new NotFoundException('激活码无效');
    const deviceKey = device.deviceKey ?? randomBytes(24).toString('hex');
    await this.prisma.device.update({ where: { id: device.id }, data: { deviceKey, activateCode: null, ip, lastSeenAt: new Date() } });
    await this.prisma.auditLog.create({ data: { action: 'DEVICE_ACTIVATE', targetType: 'device', targetId: device.id, ip } });
    return { deviceKey, deviceCode: device.code };
  }

  /** 终端内容清单：已发布内容 + 节目 + 排期（R1/R2 数据源） */
  async manifest(deviceId: string, baseUrl: string): Promise<{
    contents: PlayableItem[];
    programs: Program[];
    schedules: ScheduleSlot[];
    sync: { downloadWindow?: string };
    version: string;
  }> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('设备不存在');
    const tasks = await this.prisma.publishTask.findMany({
      where: { status: 'DONE', content: { status: 'PUBLISHED' } },
      include: { content: { include: { media: true, column: true } } },
    });
    const visible = tasks.filter((t) => {
      const byTarget =
        t.targetType === 'ALL' ||
        (t.targetType === 'GROUP' && !!device.groupId && t.targetIds.includes(device.groupId)) ||
        (t.targetType === 'DEVICE' && t.targetIds.includes(device.id));
      // 栏目-终端分组关联（CM-02）：栏目限制了可见分组时，仅组内终端可见
      const col = (t.content as { column?: { groupIds?: string[] } | null }).column;
      const byColumn = !col?.groupIds || col.groupIds.length === 0 || (!!device.groupId && col.groupIds.includes(device.groupId));
      return byTarget && byColumn;
    });

    const now = Date.now();
    const rows: Array<{ topped: boolean; sort: number; item: PlayableItem }> = [];
    for (const t of visible) {
      const c = t.content;
      if (c.validFrom && c.validFrom.getTime() > now) continue;
      if (c.validTo && c.validTo.getTime() < now) continue;
      const media = c.media;
      const body = (c.body ?? {}) as Record<string, unknown>;
      rows.push({
        topped: c.topped,
        sort: c.sort,
        item: {
          id: c.id,
          type: media?.kind === 'video' ? 'video' : media?.kind === 'image' ? 'image' : c.type === 'richtext' ? 'text' : 'text',
          title: c.title,
          remoteUrl: media ? `${baseUrl}/api/device-api/download/${media.id}` : undefined,
          html: typeof body.html === 'string' ? body.html : undefined,
          durationSec: typeof body.durationSec === 'number' ? body.durationSec : undefined,
          sha256: media?.sha256 ?? undefined,
        } as never,
      });
    }
    // CM-05：终端清单按 置顶→排序值 优先排列
    rows.sort((a, b) => (a.topped === b.topped ? b.sort - a.sort : a.topped ? -1 : 1));
    const contents = rows.map((r) => r.item);

    const programsRaw = await this.prisma.program.findMany({ where: { enabled: true, isTemplate: false }, include: { items: { include: { media: true } } } });
    const programs: Program[] = programsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      layout: (p.layout as Program['layout']) ?? 'full',
      zones: (p.zones ?? undefined) as never,
      items: p.items
        .sort((a, b) => a.sort - b.sort)
        .map((it) => ({
          id: it.id,
          type: it.type as PlayableItem['type'],
          title: it.title ?? undefined,
          remoteUrl: it.mediaId ? `${baseUrl}/api/device-api/download/${it.mediaId}` : (it.body as { url?: string })?.url,
          durationSec: it.durationSec ?? undefined,
          sha256: it.media?.sha256 ?? undefined,
        })),
    }));

    // 错峰下载窗口（PB-10）随清单下发
    const winRow = await this.prisma.appParam.findUnique({ where: { key: 'downloadWindow' } }).catch(() => undefined);
    const downloadWindow = (winRow?.value as { window?: string })?.window;

    const schedulesRaw = await this.prisma.schedule.findMany({ where: { enabled: true } });
    const schedules: ScheduleSlot[] = schedulesRaw
      .filter((s) => s.targetGroupIds.length === 0 || (device.groupId ? s.targetGroupIds.includes(device.groupId) : false))
      .map((s) => ({
        id: s.id,
        programId: s.programId,
        priority: s.priority,
        daysOfWeek: s.daysOfWeek.length ? s.daysOfWeek : undefined,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      }));

    return { contents, programs, schedules, sync: { downloadWindow }, version: createHash('sha1').update(JSON.stringify({ contents, programs, schedules })).digest('hex').slice(0, 12) };
  }

  mediaAbsPath(storagePath: string): string {
    return resolve(this.storage.rootDir, storagePath);
  }
}
