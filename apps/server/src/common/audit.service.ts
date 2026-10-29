import { Injectable, Global, Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

/** 审计日志（R7）：追加写入，业务侧显式调用记录关键动作明细 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          detail: (input.detail ?? undefined) as never,
          ip: input.ip,
        },
      })
      .catch(() => undefined);
  }

  /** 多维检索（LG-05）：动作类型、操作人、时间范围；where 供列表与导出共用 */
  buildWhere(query: { action?: string; username?: string; from?: string; to?: string }): Record<string, unknown> {
    return {
      action: query.action ? { contains: query.action } : undefined,
      user: query.username ? { username: { contains: query.username } } : undefined,
      createdAt: query.from || query.to
        ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
        : undefined,
    };
  }

  async list(query: { page?: number; pageSize?: number; action?: string; username?: string; from?: string; to?: string }): Promise<{
    total: number;
    items: Array<Record<string, unknown>>;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 20);
    const where = this.buildWhere(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' as const },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { username: true } } },
      }),
    ]);
    return {
      total,
      items: rows.map((r) => ({ ...r, detail: r.detail ?? null, username: r.user?.username ?? null })),
    };
  }

  /** 导出（LG-05）：最多 10000 条，含 BOM 便于 Excel 打开 */
  async exportCsv(query: { action?: string; username?: string; from?: string; to?: string }): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: 'desc' as const },
      take: 10000,
      include: { user: { select: { username: true } } },
    });
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['时间,操作人,动作,对象类型,对象ID,IP,明细'];
    for (const r of rows) {
      lines.push([
        r.createdAt.toISOString(),
        r.user?.username ?? '',
        esc(r.action),
        esc(r.targetType),
        esc(r.targetId),
        esc(r.ip),
        esc(JSON.stringify(r.detail ?? null)),
      ].join(','));
    }
    return '\ufeff' + lines.join('\r\n');
  }
}

@Global()
@Module({
  providers: [AuditService, NotifyService],
  exports: [AuditService, NotifyService],
})
export class AuditModule {}
