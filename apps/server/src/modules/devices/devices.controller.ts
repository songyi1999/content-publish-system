import { Body, Controller, Get, Post } from '@nestjs/common';
import type { DeviceDto } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DevicesGateway } from './devices.gateway';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DevicesGateway,
  ) {}

  @Get()
  async list(): Promise<DeviceDto[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: { createdAt: 'asc' },
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
  async create(@Body() body: { name?: string; groupId?: string }): Promise<{ id: string; code: string; activateCode: string }> {
    const code = 'DV' + Date.now().toString(36).toUpperCase();
    const activateCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const device = await this.prisma.device.create({
      data: { code, name: body.name, groupId: body.groupId, activateCode },
    });
    return { id: device.id, code: device.code, activateCode: device.activateCode! };
  }
}
