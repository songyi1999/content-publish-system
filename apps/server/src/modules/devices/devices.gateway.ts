import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DeviceCommand, DeviceEvent, HeartbeatPayload } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../../common/notify.service';

interface OnlineEntry {
  socketId: string;
  ip?: string;
  lastSeen: Date;
}

/** 终端接入网关：/device 命名空间，心跳保活（R3）、指令下发（R1/R13） */
@WebSocketGateway({ namespace: '/device', cors: { origin: '*' } })
export class DevicesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DevicesGateway.name);
  /** deviceCode -> 在线信息；判定阈值外由读取方结合 lastSeen 计算 */
  private readonly online = new Map<string, OnlineEntry>();

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`terminal connected: ${client.id} from ${client.handshake.address}`);
  }

  handleDisconnect(client: Socket): void {
    for (const [code, entry] of this.online) {
      if (entry.socketId === client.id) {
        this.online.delete(code);
        this.logger.log(`terminal offline: ${code}`);
        void this.notify.send({ key: `offline:${code}`, content: `【内容发布系统】终端离线告警：${code}（${new Date().toLocaleString('zh-CN', { hour12: false })}）` });
        break;
      }
    }
  }

  @SubscribeMessage(DeviceEvent.HEARTBEAT)
  async handleHeartbeat(_client: Socket, payload: HeartbeatPayload): Promise<{ ok: true }> {
    if (!payload?.deviceCode) return { ok: true };
    this.online.set(payload.deviceCode, {
      socketId: _client.id,
      ip: _client.handshake.address,
      lastSeen: new Date(),
    });
    await this.prisma.device
      .update({
        where: { code: payload.deviceCode },
        data: {
          lastSeenAt: new Date(),
          appVersion: payload.appVersion ?? undefined,
          model: payload.model ?? undefined,
          memTotalMB: payload.memTotalMB ?? undefined,
          storageFreeBytes: payload.storageFreeBytes ?? undefined,
        },
      })
      .catch(() => undefined);
    await this.checkStorageWatermark(payload.deviceCode, payload.storageFreeBytes);
    return { ok: true };
  }

  /** 存储水位告警（DV-07）：剩余存储低于阈值（默认 1024MB）时 webhook 告警，同终端 30 分钟节流 */
  private async checkStorageWatermark(code: string, freeBytes?: number | null): Promise<void> {
    if (freeBytes == null) return;
    const row = await this.prisma.appParam.findUnique({ where: { key: 'storageAlertFreeMB' } }).catch(() => undefined);
    const thresholdMB = typeof (row?.value as { mb?: number })?.mb === 'number' ? (row!.value as { mb: number }).mb : 1024;
    if (freeBytes > thresholdMB * 1024 * 1024) return;
    await this.notify.send({
      key: `storage:${code}`,
      throttleMs: 30 * 60_000,
      content: `【内容发布系统】终端存储水位告警：${code} 剩余 ${(freeBytes / 1024 / 1024).toFixed(0)}MB（阈值 ${thresholdMB}MB）`,
    });
  }

  /** 向指定终端下发指令（发布/下架/更新/重启/截屏等），离线终端返回 false */
  sendCommand(deviceCode: string, command: DeviceCommand): boolean {
    const entry = this.online.get(deviceCode);
    if (!entry) return false;
    this.server.to(entry.socketId).emit(DeviceEvent.COMMAND, command);
    return true;
  }

  /** 心跳超时阈值内的终端视为在线（默认 90 秒 = 3 个心跳周期） */
  isOnline(deviceCode: string, timeoutMs = 90_000): boolean {
    const entry = this.online.get(deviceCode);
    return !!entry && Date.now() - entry.lastSeen.getTime() < timeoutMs;
  }

  onlineEntries(): Array<{ code: string; ip?: string; lastSeen: Date }> {
    return [...this.online.entries()].map(([code, e]) => ({ code, ip: e.ip, lastSeen: e.lastSeen }));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}
}
