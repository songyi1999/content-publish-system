import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<Array<Record<string, unknown>>> {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({ id: r.id, name: r.name, remark: r.remark, permissions: r.permissions, userCount: r._count.users }));
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: { name: string; remark?: string; permissions?: string[] }, @CurrentUser() me: JwtUser) {
    const role = await this.prisma.role.create({
      data: { name: body.name, remark: body.remark, permissions: body.permissions ?? [] },
    });
    await this.audit.log({ userId: me.sub, action: 'ROLE_CREATE', targetType: 'role', targetId: role.id, detail: { name: body.name } });
    return { id: role.id };
  }

  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: { remark?: string; permissions?: string[] },
    @CurrentUser() me: JwtUser,
  ) {
    await this.prisma.role.update({ where: { id }, data: { remark: body.remark, permissions: body.permissions } });
    await this.audit.log({ userId: me.sub, action: 'ROLE_UPDATE', targetType: 'role', targetId: id, detail: body });
    return { ok: true };
  }
}
