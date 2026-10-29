import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

/** 排期（R12）：分时段 + 优先级 + 周期 */
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.schedule.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], include: { program: { select: { name: true } } } });
  }

  /** 交叠校验（PD-06）：scheduleOverlap=forbid 时，同终端组/同星期/时间重叠的排期拒绝保存 */
  private async assertNoOverlap(candidate: { targetGroupIds: string[]; daysOfWeek: number[]; startMinute: number; endMinute: number }, excludeId?: string) {
    const row = await this.prisma.appParam.findUnique({ where: { key: 'scheduleOverlap' } }).catch(() => undefined);
    if ((row?.value as { mode?: string })?.mode !== 'forbid') return;
    const all = await this.prisma.schedule.findMany({ where: excludeId ? { id: { not: excludeId } } : {} });
    const daysHit = (a: number[], b: number[]) => a.length === 0 || b.length === 0 || a.some((d) => b.includes(d));
    const groupsHit = (a: string[], b: string[]) => a.length === 0 || b.length === 0 || a.some((g) => b.includes(g));
    const timeHit = (s1: number, e1: number, s2: number, e2: number) => (s1 < e1 ? s2 < e1 && s1 < e2 : s2 < e1 || s1 < e2); // s1>=e1 视为跨午夜
    for (const other of all) {
      if (
        groupsHit(candidate.targetGroupIds, other.targetGroupIds) &&
        daysHit(candidate.daysOfWeek, other.daysOfWeek) &&
        timeHit(candidate.startMinute, candidate.endMinute, other.startMinute, other.endMinute)
      ) {
        throw new BadRequestException(`排期交叠冲突（PD-06）：与「${other.name}」时间交叠（当前策略禁止交叠）`);
      }
    }
  }

  @Post()
  @Roles('admin', 'publisher', 'auditor')
  async create(
    @Body() body: { name: string; programId: string; targetGroupIds?: string[]; priority?: number; daysOfWeek?: number[]; startMinute?: number; endMinute?: number },
    @CurrentUser() me: JwtUser,
  ) {
    const candidate = {
      targetGroupIds: body.targetGroupIds ?? [],
      daysOfWeek: body.daysOfWeek ?? [],
      startMinute: body.startMinute ?? 0,
      endMinute: body.endMinute ?? 1440,
    };
    await this.assertNoOverlap(candidate);
    const s = await this.prisma.schedule.create({
      data: { name: body.name, programId: body.programId, ...candidate },
    });
    await this.audit.log({ userId: me.sub, action: 'SCHEDULE_CREATE', targetType: 'schedule', targetId: s.id, detail: body });
    return { id: s.id };
  }

  @Put(':id')
  @Roles('admin', 'publisher', 'auditor')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    const cur = await this.prisma.schedule.findUnique({ where: { id } });
    if (cur) {
      await this.assertNoOverlap({
        targetGroupIds: (body.targetGroupIds as string[]) ?? cur.targetGroupIds,
        daysOfWeek: (body.daysOfWeek as number[]) ?? cur.daysOfWeek,
        startMinute: (body.startMinute as number) ?? cur.startMinute,
        endMinute: (body.endMinute as number) ?? cur.endMinute,
      }, id);
    }
    await this.prisma.schedule.update({ where: { id }, data: body as never });
    await this.audit.log({ userId: me.sub, action: 'SCHEDULE_UPDATE', targetType: 'schedule', targetId: id, detail: body });
    return { ok: true };
  }

  @Delete(':id')
  @Roles('admin', 'publisher', 'auditor')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    await this.prisma.schedule.delete({ where: { id } });
    await this.audit.log({ userId: me.sub, action: 'SCHEDULE_DELETE', targetType: 'schedule', targetId: id });
    return { ok: true };
  }
}
