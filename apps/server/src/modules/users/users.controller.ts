import { Body, Controller, Get, Param, ParseBoolPipe, Put, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { hashPassword } from '../../common/password';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<Array<Record<string, unknown>>> {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, displayName: true, enabled: true, createdAt: true, role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({ ...u, roleId: u.role?.id ?? null, role: u.role?.name ?? null }));
  }

  @Post()
  @Roles('admin')
  async create(
    @Body() body: { username: string; password: string; displayName?: string; roleId?: string },
    @CurrentUser() me: JwtUser,
  ) {
    const user = await this.prisma.user.create({
      data: {
        username: body.username,
        passwordHash: hashPassword(body.password),
        displayName: body.displayName,
        roleId: body.roleId,
      },
    });
    await this.audit.log({ userId: me.sub, action: 'USER_CREATE', targetType: 'user', targetId: user.id, detail: { username: body.username } });
    return { id: user.id };
  }

  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: { displayName?: string; roleId?: string | null; enabled?: boolean },
    @CurrentUser() me: JwtUser,
  ) {
    await this.prisma.user.update({
      where: { id },
      data: {
        displayName: body.displayName,
        roleId: body.roleId === undefined ? undefined : body.roleId,
        enabled: body.enabled,
      },
    });
    await this.audit.log({ userId: me.sub, action: 'USER_UPDATE', targetType: 'user', targetId: id, detail: body });
    return { ok: true };
  }

  @Put(':id/password')
  @Roles('admin')
  async resetPassword(@Param('id') id: string, @Body() body: { password: string }, @CurrentUser() me: JwtUser) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(body.password) } });
    await this.audit.log({ userId: me.sub, action: 'USER_RESET_PASSWORD', targetType: 'user', targetId: id });
    return { ok: true };
  }
}
