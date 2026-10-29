import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { DeviceCommandType, DeviceDto } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { DevicesGateway } from './devices.gateway';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DevicesGateway,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<DeviceDto[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: { createdAt: 'asc' as const },
      include: { group: { select: { name: true } } },
    });
    return devices.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      groupId: d.groupId,
      appVersion: d.appVersion,
      ip: d.ip,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      online: this.gateway.isOnline(d.code),
    }));
  }

  /** 创建设备并生成激活码（DV-01），终端凭激活码完成注册 */
  @Post()
  @Roles('admin')
  async create(@Body() body: { name?: string; groupId?: string }, @CurrentUser() me: JwtUser) {
    const code = 'DV' + Date.now().toString(36).toUpperCase();
    const activateCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const device = await this.prisma.device.create({
      data: { code, name: body.name, groupId: body.groupId, activateCode },
    });
    await this.audit.log({ userId: me.sub, action: 'DEVICE_CREATE', targetType: 'device', targetId: device.id, detail: { code } });
    return { id: device.id, code: device.code, activateCode: device.activateCode! };
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: { name?: string; groupId?: string | null; enabled?: boolean; powerPlan?: Record<string, unknown> }, @CurrentUser() me: JwtUser) {
    await this.prisma.device.update({ where: { id }, data: body as never });
    if (body.powerPlan) {
      this.gateway.sendCommand((await this.prisma.device.findUnique({ where: { id } }))!.code, {
        id: randomBytes(8).toString('hex'),
        type: 'set_power_plan' as unknown as DeviceCommandType,
        payload: body.powerPlan,
        issuedAt: Date.now(),
      });
    }
    await this.audit.log({ userId: me.sub, action: 'DEVICE_UPDATE', targetType: 'device', targetId: id, detail: body });
    return { ok: true };
  }

  /** 远程指令（DV-08/DV-11）：重启/关机/截屏 */
  @Post(':id/command')
  @Roles('admin')
  async command(@Param('id') id: string, @Body() body: { type: string; payload?: Record<string, unknown> }, @CurrentUser() me: JwtUser) {
    const device = await this.prisma.device.findUnique({ where: { id } } );
    if (!device) return { ok: false, message: '设备不存在' };
    const sent = this.gateway.sendCommand(device.code, {
      id: randomBytes(8).toString('hex'),
      type: body.type as DeviceCommandType,
      payload: body.payload,
      issuedAt: Date.now(),
    });
    await this.audit.log({ userId: me.sub, action: `DEVICE_CMD_${body.type}`, targetType: 'device', targetId: id, detail: { sent } });
    return { ok: sent, message: sent ? '已下发' : '终端离线，待上线执行' };
  }

  /** 在线看板汇总（DV-06） */
  @Get('dashboard')
  async dashboard() {
    const devices = await this.prisma.device.findMany({ select: { code: true, groupId: true } });
    const online = devices.filter((d) => this.gateway.isOnline(d.code)).length;
    const offline = devices.length - online;
    return { total: devices.length, online, offline, onlineRate: devices.length ? Math.round((online / devices.length) * 100) : 0 };
  }
}

/** 设备分组（DV-03） */
@Controller('device-groups')
export class DeviceGroupsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.deviceGroup.findMany({
      orderBy: { createdAt: 'asc' as const },
      include: { _count: { select: { devices: true } } },
    });
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: { name: string }) {
    const g = await this.prisma.deviceGroup.create({ data: { name: body.name } });
    return { id: g.id };
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: { name?: string }) {
    await this.prisma.deviceGroup.update({ where: { id }, data: body });
    return { ok: true };
  }

  @Delete()
  @Roles('admin')
  async remove(@Body() body: { id: string }) {
    const used = await this.prisma.device.count({ where: { groupId: body.id } });
    if (used > 0) return { ok: false, message: `分组下有 ${used} 台设备` };
    await this.prisma.deviceGroup.delete({ where: { id: body.id } });
    return { ok: true };
  }
}
