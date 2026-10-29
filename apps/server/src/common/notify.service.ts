import { Injectable, Logger } from '@nestjs/common';

export interface NotifyPayload {
  /** 告警去重键（同键 10 分钟内只发一次） */
  key: string;
  content: string;
  /** 可选：图片 base64（先文本后图片） */
  imageBase64?: string;
}

/** 告警通知（DV-07/SY-03）：webhook 渠道，同键 10 分钟节流，发送失败不影响主流程 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly sentAt = new Map<string, number>();
  private static readonly THROTTLE_MS = 10 * 60_000;

  get enabled(): boolean {
    return !!process.env.ALERT_WEBHOOK_URL;
  }

  async send(payload: NotifyPayload): Promise<void> {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;
    const last = this.sentAt.get(payload.key) ?? 0;
    if (Date.now() - last < NotifyService.THROTTLE_MS) return;
    this.sentAt.set(payload.key, Date.now());
    try {
      const body: Record<string, string> = { content: payload.content };
      if (payload.imageBase64) body.image = payload.imageBase64;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) this.logger.warn(`webhook ${res.status}`);
    } catch (e) {
      this.logger.warn(`webhook 发送失败: ${(e as Error).message}`);
    }
  }
}
