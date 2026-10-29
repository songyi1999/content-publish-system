import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
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

  @Post()
  @Roles('admin', 'publisher', 'auditor')
  async create(
    @Body() body: { name: string; programId: string; targetGroupIds?: string[]; priority?: number; daysOfWeek?: number[]; startMinute?: number; endMinute?: number },
    @CurrentUser() me: JwtUser,
  ) {
    const s = await this.prisma.schedule.create({
      data: {
        name: body.name,
        programId: body.programId,
        targetGroupIds: body.targetGroupIds ?? [],
        priority: body.priority ?? 1,
        daysOfWeek: body.daysOfWeek ?? [],
        startMinute: body.startMinute ?? 0,
        endMinute: body.endMinute ?? 1440,
      },
    });
    await this.audit.log({ userId: me.sub, action: 'SCHEDULE_CREATE', targetType: 'schedule', targetId: s.id, detail: body });
    return { id: s.id };
  }

  @Put(':id')
  @Roles('admin', 'publisher', 'auditor')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
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
