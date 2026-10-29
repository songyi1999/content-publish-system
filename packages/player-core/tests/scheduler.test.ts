import { describe, expect, it } from 'vitest';
import { locateInPlaylist } from '../src/playlist';
import { pickActiveSlot, slotIsActive } from '../src/scheduler';
import type { ScheduleSlot } from '@cps/shared';

const slot = (over: Partial<ScheduleSlot> & Pick<ScheduleSlot, 'id' | 'programId'>): ScheduleSlot => ({
  priority: 1,
  ...over,
});

describe('slotIsActive', () => {
  const wed10am = new Date(2026, 9, 28, 10, 0, 0); // 2026-10-28 周三

  it('无限制时段全天生效', () => {
    expect(slotIsActive(slot({ id: 'a', programId: 'p1' }), wed10am)).toBe(true);
  });

  it('时段内生效、时段外不生效', () => {
    const s = slot({ id: 'a', programId: 'p1', startMinute: 9 * 60, endMinute: 12 * 60 });
    expect(slotIsActive(s, new Date(2026, 9, 28, 11, 59))).toBe(true);
    expect(slotIsActive(s, new Date(2026, 9, 28, 12, 0))).toBe(false);
  });

  it('按星期过滤', () => {
    const s = slot({ id: 'a', programId: 'p1', daysOfWeek: [1, 3, 5] });
    expect(slotIsActive(s, wed10am)).toBe(true); // 周三
    expect(slotIsActive(s, new Date(2026, 9, 29, 10, 0))).toBe(false); // 周四
  });

  it('跨午夜窗口', () => {
    const s = slot({ id: 'a', programId: 'p1', startMinute: 22 * 60, endMinute: 6 * 60 });
    expect(slotIsActive(s, new Date(2026, 9, 28, 23, 0))).toBe(true);
    expect(slotIsActive(s, new Date(2026, 9, 28, 5, 59))).toBe(true);
    expect(slotIsActive(s, new Date(2026, 9, 28, 12, 0))).toBe(false);
  });
});

describe('pickActiveSlot 优先级冲突', () => {
  it('多排期同时生效取优先级最高', () => {
    const now = new Date(2026, 9, 28, 10, 0);
    const slots = [
      slot({ id: 'a', programId: 'p-daily', priority: 1 }),
      slot({ id: 'b', programId: 'p-noon', priority: 5, startMinute: 11 * 60, endMinute: 13 * 60 }),
      slot({ id: 'c', programId: 'p-urgent', priority: 100 }),
    ];
    expect(pickActiveSlot(slots, now)?.programId).toBe('p-urgent');
  });

  it('无生效排期返回 null（回落默认节目单）', () => {
    const now = new Date(2026, 9, 28, 10, 0);
    const slots = [slot({ id: 'a', programId: 'p', startMinute: 20 * 60, endMinute: 22 * 60 })];
    expect(pickActiveSlot(slots, now)).toBeNull();
  });
});

describe('locateInPlaylist 循环定位', () => {
  const items = [
    { id: '1', type: 'image' as const, durationSec: 10 },
    { id: '2', type: 'image' as const, durationSec: 20 },
  ];

  it('按时长顺序定位', () => {
    expect(locateInPlaylist(items, 5_000)?.item.id).toBe('1');
    expect(locateInPlaylist(items, 10_000)?.item.id).toBe('2');
    expect(locateInPlaylist(items, 25_000)?.item.id).toBe('2');
  });

  it('超总时长后循环', () => {
    const r = locateInPlaylist(items, 35_000); // 总时长 30s，35s -> 回到第 1 条 5s 处
    expect(r?.item.id).toBe('1');
    expect(r?.progressMs).toBe(5_000);
  });

  it('空节目返回 null', () => {
    expect(locateInPlaylist([], 0)).toBeNull();
  });
});
