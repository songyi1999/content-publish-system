import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, CONTENT_TRANSITIONS } from '@cps/shared';
import type { ContentStatus as Status } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 内容状态机（R6/R8/AV-02）：非法迁移直接拒绝，发布仅可从 APPROVED 触发 */
export function assertTransition(from: string, to: string): void {
  const allowed = CONTENT_TRANSITIONS[from as Status];
  if (!allowed || !allowed.includes(to as Status)) {
    throw new BadRequestException(`不允许的状态迁移：${from} -> ${to}`);
  }
}

@Injectable()
export class ContentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { columnId?: string; status?: string; keyword?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 20);
    const where = {
      columnId: query.columnId || undefined,
      status: query.status || undefined,
      title: query.keyword ? { contains: query.keyword } : undefined,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.content.count({ where }),
      this.prisma.content.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { column: { select: { name: true } }, media: { select: { id: true, kind: true, storagePath: true } } },
      }),
    ]);
    return { total, items };
  }

  async get(id: string) {
    const content = await this.prisma.content.findUnique({
      where: { id },
      include: { column: true, media: true },
    });
    if (!content) throw new NotFoundException('内容不存在');
    return content;
  }

  async create(body: {
    title: string;
    columnId?: string;
    type?: string;
    body?: Record<string, unknown>;
    mediaId?: string;
    validFrom?: string;
    validTo?: string;
  }) {
    const content = await this.prisma.content.create({
      data: {
        title: body.title,
        columnId: body.columnId,
        type: body.type ?? 'richtext',
        body: (body.body ?? undefined) as never,
        mediaId: body.mediaId,
        validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
        validTo: body.validTo ? new Date(body.validTo) : undefined,
      },
    });
    return { id: content.id };
  }

  async update(id: string, body: {
    title?: string;
    columnId?: string | null;
    type?: string;
    body?: Record<string, unknown>;
    mediaId?: string | null;
    validFrom?: string;
    validTo?: string;
    sort?: number;
  }) {
    // 已发布内容修改后回到草稿（重新走审核）；修改前留存版本快照（CM-06）
    const cur = await this.prisma.content.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('内容不存在');
    await this.prisma.contentVersion.create({
      data: { contentId: id, title: cur.title, body: (cur.body ?? undefined) as never },
    });
    if (cur.status === ContentStatus.PUBLISHED) {
      await this.prisma.content.update({ where: { id }, data: { status: ContentStatus.DRAFT } });
      await this.prisma.publishTask.updateMany({ where: { contentId: id, status: 'DONE' }, data: { status: 'FAILED' } });
    }
    await this.prisma.content.update({
      where: { id },
      data: {
        title: body.title,
        columnId: body.columnId === undefined ? undefined : body.columnId,
        type: body.type,
        body: (body.body ?? undefined) as never,
        mediaId: body.mediaId === undefined ? undefined : body.mediaId,
        validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
        validTo: body.validTo ? new Date(body.validTo) : undefined,
        sort: typeof body.sort === 'number' ? body.sort : undefined,
      },
    });
    return { ok: true };
  }

  /** 状态迁移统一入口：submit / ai-pass / ai-reject / approve / reject / publish */
  async transition(id: string, to: Status, actorUserId?: string, reason?: string) {
    const cur = await this.prisma.content.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('内容不存在');
    assertTransition(cur.status, to);
    const updated = await this.prisma.content.update({ where: { id }, data: { status: to } });
    await this.prisma.auditLog.create({
      data: {
        userId: actorUserId ?? null,
        action: `CONTENT_${to}`,
        targetType: 'content',
        targetId: id,
        detail: { from: cur.status, to, reason } as never,
      },
    });
    return { id: updated.id, status: updated.status };
  }

  async extractText(id: string): Promise<string> {
    const c = await this.get(id);
    const b = (c.body ?? {}) as Record<string, unknown>;
    const parts: string[] = [c.title];
    if (typeof b.html === 'string') parts.push(b.html.replace(/<[^>]+>/g, ' '));
    if (typeof b.text === 'string') parts.push(b.text);
    return parts.filter(Boolean).join('\n');
  }

  /** 版本历史（CM-06） */
  async versions(contentId: string) {
    return this.prisma.contentVersion.findMany({
      where: { contentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** 恢复到历史版本：应用快照并回到草稿重新走审核 */
  async restoreVersion(contentId: string, versionId: string) {
    const v = await this.prisma.contentVersion.findUnique({ where: { id: versionId } });
    if (!v || v.contentId !== contentId) throw new NotFoundException('版本不存在');
    const body = (v.body ?? {}) as Record<string, unknown>;
    await this.update(contentId, { title: v.title, body });
    if (body.columnId !== undefined) await this.prisma.content.update({ where: { id: contentId }, data: { columnId: String(body.columnId) } });
    await this.prisma.content.update({ where: { id: contentId }, data: { status: 'DRAFT' } });
    return { ok: true };
  }
}