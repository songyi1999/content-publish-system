import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

interface ProgramItemInput {
  type: 'image' | 'video' | 'web' | 'text';
  mediaId?: string;
  title?: string;
  durationSec?: number;
  body?: Record<string, unknown>;
}

/** 节目（R11 模板化分屏编排）：版式 + 条目集合 */
@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    return this.prisma.program.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { sort: 'asc' } } } });
  }

  @Post()
  @Roles('admin', 'editor')
  async create(@Body() body: { name: string; layout: string; zones?: Record<string, unknown>; isTemplate?: boolean; items?: ProgramItemInput[] }, @CurrentUser() me: JwtUser) {
    const program = await this.prisma.program.create({
      data: {
        name: body.name,
        layout: body.layout ?? 'full',
        zones: (body.zones ?? undefined) as never,
        isTemplate: body.isTemplate === true,
        items: { create: (body.items ?? []).map((it, i) => this.itemData(it, i)) },
      },
      include: { items: true },
    });
    await this.audit.log({ userId: me.sub, action: 'PROGRAM_CREATE', targetType: 'program', targetId: program.id, detail: { name: body.name } });
    return { id: program.id };
  }

  @Put(':id')
  @Roles('admin', 'editor')
  async update(@Param('id') id: string, @Body() body: { name?: string; layout?: string; zones?: Record<string, unknown>; enabled?: boolean; items?: ProgramItemInput[] }, @CurrentUser() me: JwtUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.program.update({ where: { id }, data: { name: body.name, layout: body.layout, zones: (body.zones ?? undefined) as never, enabled: body.enabled } });
      if (body.items) {
        await tx.programItem.deleteMany({ where: { programId: id } });
        await tx.programItem.createMany({ data: body.items.map((it, i) => ({ ...this.itemData(it, i), programId: id })) });
      }
    });
    await this.audit.log({ userId: me.sub, action: 'PROGRAM_UPDATE', targetType: 'program', targetId: id });
    return { ok: true };
  }

  /** 另存为模板（PD-03）：复制节目为模板，不出现在终端清单 */
  @Post(':id/save-as-template')
  @Roles('admin', 'editor')
  async saveAsTemplate(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const src = await this.prisma.program.findUnique({ where: { id }, include: { items: true } });
    if (!src) return { ok: false, message: '节目不存在' };
    const tpl = await this.prisma.program.create({
      data: {
        name: `${src.name}（模板）`,
        layout: src.layout,
        zones: (src.zones ?? undefined) as never,
        isTemplate: true,
        items: { create: src.items.map((it, i) => ({ sort: i, type: it.type, title: it.title, mediaId: it.mediaId, durationSec: it.durationSec, body: (it.body ?? undefined) as never })) },
      },
    });
    await this.audit.log({ userId: me.sub, action: 'PROGRAM_TEMPLATE_SAVE', targetType: 'program', targetId: tpl.id, detail: { from: id } });
    return { id: tpl.id };
  }

  @Delete(':id')
  @Roles('admin', 'editor')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const used = await this.prisma.schedule.count({ where: { programId: id } });
    if (used > 0) return { ok: false, message: '节目已被排期引用，无法删除' };
    await this.prisma.program.delete({ where: { id } });
    await this.audit.log({ userId: me.sub, action: 'PROGRAM_DELETE', targetType: 'program', targetId: id });
    return { ok: true };
  }

  private itemData(it: ProgramItemInput, index: number) {
    return {
      sort: index,
      type: it.type,
      title: it.title,
      mediaId: it.mediaId,
      durationSec: it.durationSec,
      body: (it.body ?? undefined) as never,
    };
  }
}
