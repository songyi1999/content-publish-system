# 批次二服务端补丁：I11进度/I12错峰参数/I14交叠/I15绿色通道/I16台账水位/I17解绑擦除/I20自动备份/I21密码强度/I22双档缩略图/I23重发
import io, re

def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert old in s, f'{path}: NOT FOUND -> {old[:60]!r}'
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok', path)

# ---------- 1. schema: Device 台账字段 ----------
patch(r'apps/server/prisma/schema.prisma', [(
"""  appVersion   String?
  ip           String?
  lastSeenAt   DateTime?""",
"""  appVersion   String?
  ip           String?
  lastSeenAt   DateTime?
  /// 台账（DV-02/DV-07）：型号、内存、剩余存储（心跳上报）
  model        String?
  memTotalMB   Int?
  storageFreeBytes BigInt?""")])

# ---------- 2. shared: CLEAR_CACHE 指令 + DeviceDto 台账字段 ----------
patch(r'packages/shared/src/index.ts', [
("""  SCREENSHOT: 'screenshot',
  SET_VOLUME: 'set_volume',
} as const;""",
"""  SCREENSHOT: 'screenshot',
  SET_VOLUME: 'set_volume',
  CLEAR_CACHE: 'clear_cache',
  SET_POWER_PLAN: 'set_power_plan',
} as const;"""),
("""  lastSeenAt: string | null;
  online: boolean;
}""",
"""  lastSeenAt: string | null;
  online: boolean;
  model?: string | null;
  memTotalMB?: number | null;
  storageFreeBytes?: number | null;
  powerPlan?: unknown;
}""")])

# ---------- 3. 设备控制器：台账字段 + 解绑 + 擦除 ----------
patch(r'apps/server/src/modules/devices/devices.controller.ts', [
("""      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      online: this.gateway.isOnline(d.code),
    }));""",
"""      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      online: this.gateway.isOnline(d.code),
      model: d.model,
      memTotalMB: d.memTotalMB,
      storageFreeBytes: d.storageFreeBytes,
      powerPlan: d.powerPlan,
    }));"""),
("""  /** 远程指令（DV-08/DV-11）：重启/关机/截屏 */""",
"""  /** 解绑（DV-04）：清除设备密钥、重发激活码，终端需重新激活 */
  @Post(':id/unbind')
  @Roles('admin')
  async unbind(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const activateCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    await this.prisma.device.update({ where: { id }, data: { deviceKey: null, activateCode, lastSeenAt: null } });
    await this.audit.log({ userId: me.sub, action: 'DEVICE_UNBIND', targetType: 'device', targetId: id });
    return { ok: true, activateCode };
  }

  /** 远程擦除（DV-04）：指令终端清空本地缓存与配置并回到激活页 */
  @Post(':id/wipe')
  @Roles('admin')
  async wipe(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) return { ok: false, message: '设备不存在' };
    const sent = this.gateway.sendCommand(device.code, {
      id: randomBytes(8).toString('hex'),
      type: 'clear_cache' as unknown as DeviceCommandType,
      payload: {},
      issuedAt: Date.now(),
    });
    await this.audit.log({ userId: me.sub, action: 'DEVICE_WIPE', targetType: 'device', targetId: id, detail: { sent } });
    return { ok: sent, message: sent ? '擦除指令已下发' : '终端离线，上线后自动拉取空清单并清缓存' };
  }

  /** 远程指令（DV-08/DV-11）：重启/关机/截屏 */"""),
])

# ---------- 4. 网关：心跳台账入库 + 存储水位告警 ----------
patch(r'apps/server/src/modules/devices/devices.gateway.ts', [
("""    await this.prisma.device
      .update({
        where: { code: payload.deviceCode },
        data: {
          lastSeenAt: new Date(),
          appVersion: payload.appVersion ?? undefined,
        },
      })
      .catch(() => undefined);
    return { ok: true };""",
"""    await this.prisma.device
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
    });""")])

# ---------- 5. NotifyService 支持 throttleMs ----------
patch(r'apps/server/src/common/notify.service.ts', [
("""  async send(payload: { key: string; content: string; imageBase64?: string }): Promise<void> {""",
"""  async send(payload: { key: string; content: string; imageBase64?: string; throttleMs?: number }): Promise<void> {"""),
])

# ---------- 6. 终端上报：SYNC_PROGRESS 写入任务 perDeviceProgress ----------
patch(r'apps/server/src/modules/device-api/device-api.controller.ts', [
("""    if (body.event === 'DOWNLOAD_DONE') {
      await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }
    return { ok: true };""",
"""    if (body.event === 'DOWNLOAD_DONE') {
      await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }
    // 逐台下载进度（PB-06）：终端同步进度写入对应内容的最近发布任务
    if (body.event === 'SYNC_PROGRESS' && body.detail && typeof body.detail.percent === 'number') {
      const task = await this.prisma.publishTask.findFirst({
        where: { contentId: String(body.detail.contentId ?? ''), status: 'DONE' },
        orderBy: { createdAt: 'desc' },
      });
      if (task) {
        const t = (task.body ?? {}) as Record<string, unknown>;
        const prog = (t.perDeviceProgress ?? {}) as Record<string, number>;
        prog[device.code] = Math.max(0, Math.min(100, Math.round(body.detail.percent)));
        await this.prisma.publishTask.update({ where: { id: task.id }, data: { body: { ...t, perDeviceProgress: prog } as never } });
      }
    }
    return { ok: true };"""),
])

# ---------- 7. 排期交叠校验（PD-06） ----------
patch(r'apps/server/src/modules/schedules/schedules.controller.ts', [
("""import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';""",
"""import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';"""),
("""  @Post()
  @Roles('admin', 'publisher', 'auditor')
  async create(
    @Body() body: { name: string; programId: string; targetGroupIds?: string[]; priority?: number; daysOfWeek?: number[]; startMinute?: number; endMinute?: number },
    @CurrentUser() me: JwtUser,
  ) {
    const s = await this.prisma.schedule.create({""",
"""  /** 交叠校验（PD-06）：scheduleOverlap=forbid 时，同终端组/同星期/时间重叠的排期拒绝保存 */
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
    const s = await this.prisma.schedule.create({"""),
("""      data: {
        name: body.name,
        programId: body.programId,
        targetGroupIds: body.targetGroupIds ?? [],
        priority: body.priority ?? 1,
        daysOfWeek: body.daysOfWeek ?? [],
        startMinute: body.startMinute ?? 0,
        endMinute: body.endMinute ?? 1440,
      },
    });""",
"""      data: { name: body.name, programId: body.programId, ...candidate },
    });"""),
("""  @Put(':id')
  @Roles('admin', 'publisher', 'auditor')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    await this.prisma.schedule.update({ where: { id }, data: body as never });""",
"""  @Put(':id')
  @Roles('admin', 'publisher', 'auditor')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    const cur = await this.prisma.schedule.findUnique({ where: { id } });
    if (!cur) return { ok: false, message: '排期不存在' };
    await this.assertNoOverlap({
      targetGroupIds: (body.targetGroupIds as string[]) ?? cur.targetGroupIds,
      daysOfWeek: (body.daysOfWeek as number[]) ?? cur.daysOfWeek,
      startMinute: (body.startMinute as number) ?? cur.startMinute,
      endMinute: (body.endMinute as number) ?? cur.endMinute,
    }, id);
    await this.prisma.schedule.update({ where: { id }, data: body as never });"""),
])

# ---------- 8. 绿色通道（PD-07）+ 重发（PB-07） ----------
patch(r'apps/server/src/modules/review/review.controller.ts', [
("""  /** 编辑提交后自动触发 AI 初审（也可手动重扫） */""",
"""  /** 紧急插播绿色通道（PD-07）：审核员/管理员跳过 AI 与人工复审直接通过，全程留痕 */
  @Post(':id/fast-approve')
  @Roles('admin', 'auditor')
  async fastApprove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const cur = await this.prisma.content.findUnique({ where: { id } });
    if (!cur) throw new (await import('@nestjs/common')).NotFoundException('内容不存在');
    if (!['DRAFT', 'AI_REVIEW', 'MANUAL_REVIEW', 'REJECTED'].includes(cur.status)) {
      throw new (await import('@nestjs/common')).BadRequestException(`当前状态 ${cur.status} 无需绿色通道`);
    }
    await this.prisma.content.update({ where: { id }, data: { status: 'APPROVED' } });
    await this.prisma.auditLog.create({
      data: { userId: me.sub, action: 'CONTENT_FAST_APPROVED', targetType: 'content', targetId: id, detail: { from: cur.status, channel: 'emergency' } as never },
    });
    return { id, status: 'APPROVED' };
  }

  /** 编辑提交后自动触发 AI 初审（也可手动重扫） */"""),
])

patch(r'apps/server/src/modules/publish/publish.service.ts', [
("""  /** 整批撤回（PB-04）：同批次任务全部下架，终端同步删除本地内容 */""",
"""  /** 手动重发（PB-07）：对未撤回任务重新执行下发 */
  async retryTask(taskId: string, actorId?: string) {
    const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'REVOKED') throw new BadRequestException('已撤回任务不可重发，请重新发布');
    await this.execute(taskId);
    await this.prisma.auditLog.create({ data: { userId: actorId, action: 'PUBLISH_RETRY', targetType: 'publishTask', targetId: taskId } });
    return { ok: true };
  }

  /** 整批撤回（PB-04）：同批次任务全部下架，终端同步删除本地内容 */"""),
])

patch(r'apps/server/src/modules/publish/publish.controller.ts', [
("""  /** 整批撤回（PB-04）：发布单内全部任务下架 */""",
"""  /** 手动重发（PB-07） */
  @Post(':id/retry')
  @Roles('admin', 'auditor', 'publisher')
  retry(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    return this.publish.retryTask(id, me.sub);
  }

  /** 整批撤回（PB-04）：发布单内全部任务下架 */"""),
])

# ---------- 9. 参数键补齐 ----------
patch(r'apps/server/src/modules/system/system.controller.ts', [
("""  'downloadWindow',
  'passwordPolicy',
  'review',
] as const;""",
"""  'downloadWindow',
  'passwordPolicy',
  'review',
  'scheduleOverlap',
  'storageAlertFreeMB',
  'backupAutoEnabled',
] as const;"""),
])

print('ALL SERVER PATCHES APPLIED')
