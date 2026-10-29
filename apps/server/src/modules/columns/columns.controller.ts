import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('columns')
export class ColumnsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async tree(): Promise<Array<Record<string, unknown>>> {
    const nodes = await this.prisma.columnNode.findMany({
      orderBy: { sort: 'asc' as const },
      include: { _count: { select: { contents: true, children: true } } },
    });
    const map = new Map<string, Record<string, unknown>>();
    const roots: Array<Record<string, unknown>> = [];
    for (const n of nodes) map.set(n.id, { ...n, children: [] });
    for (const n of nodes) {
      const node = map.get(n.id)!;
      if (n.parentId && map.has(n.parentId)) (map.get(n.parentId)!.children as Array<Record<string, unknown>>).push(node);
      else roots.push(node);
    }
    return roots;
  }

  @Post()
  @Roles('admin', 'editor')
  async create(@Body() body: { name: string; parentId?: string; sort?: number }, @CurrentUser() me: JwtUser) {
    const node = await this.prisma.columnNode.create({
      data: { name: body.name, parentId: body.parentId, sort: body.sort ?? 0 },
    });
    await this.audit.log({ userId: me.sub, action: 'COLUMN_CREATE', targetType: 'column', targetId: node.id, detail: { name: body.name } });
    return { id: node.id };
  }

  @Put(':id')
  @Roles('admin', 'editor')
  async update(@Param('id') id: string, @Body() body: { name?: string; sort?: number; enabled?: boolean }, @CurrentUser() me: JwtUser) {
    await this.prisma.columnNode.update({ where: { id }, data: body });
    await this.audit.log({ userId: me.sub, action: 'COLUMN_UPDATE', targetType: 'column', targetId: id, detail: body });
    return { ok: true };
  }

  @Delete(':id')
  @Roles('admin', 'editor')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const [childCount, contentCount] = await this.prisma.$transaction([
      this.prisma.columnNode.count({ where: { parentId: id } }),
      this.prisma.content.count({ where: { columnId: id } }),
    ]);
    if (childCount > 0) return { ok: false, message: '存在子栏目，无法删除' };
    if (contentCount > 0) return { ok: false, message: '栏目下存在内容，无法删除' };
    await this.prisma.columnNode.delete({ where: { id } });
    await this.audit.log({ userId: me.sub, action: 'COLUMN_DELETE', targetType: 'column', targetId: id });
    return { ok: true };
  }
}
