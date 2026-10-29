import { Injectable, Global, Module } from '@nestjs/common';
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

  async list(query: { page?: number; pageSize?: number; action?: string }): Promise<{
    total: number;
    items: Array<Record<string, unknown>>;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 20);
    const where = query.action ? { action: { contains: query.action } } : {};
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
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
