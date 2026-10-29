import type { ScheduleSlot } from '@cps/shared';

export interface ActiveSlot {
  slotId: string;
  programId: string;
  priority: number;
}

const DAY_MINUTES = 24 * 60;

/** 判断某排期在给定时刻是否生效（含星期过滤与跨午夜窗口） */
export function slotIsActive(slot: ScheduleSlot, now: Date): boolean {
  if (slot.daysOfWeek && slot.daysOfWeek.length > 0 && !slot.daysOfWeek.includes(now.getDay())) {
    return false;
  }
  const start = slot.startMinute ?? 0;
  const end = slot.endMinute ?? DAY_MINUTES;
  const m = now.getHours() * 60 + now.getMinutes();
  if (start <= end) {
    return m >= start && m < end;
  }
  return m >= start || m < end;
}

/**
 * 冲突策略：同时生效的排期中取优先级最高者；
 * 无任何生效排期时返回 null，由调用方回落默认节目单（保证不黑屏）。
 */
export function pickActiveSlot(slots: ScheduleSlot[], now: Date): ActiveSlot | null {
  let best: ScheduleSlot | null = null;
  for (const slot of slots) {
    if (!slotIsActive(slot, now)) continue;
    if (!best || slot.priority > best.priority) best = slot;
  }
  return best ? { slotId: best.id, programId: best.programId, priority: best.priority } : null;
}
