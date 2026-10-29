import type { PlayableItem } from '@cps/shared';

const DEFAULT_DURATION_SEC = 10;

export function itemDuration(item: PlayableItem): number {
  return item.durationSec ?? DEFAULT_DURATION_SEC;
}

/**
 * 循环播放定位：按节目内条目时长顺序循环，给定时刻计算当前应展示的条目与进度。
 * 纯函数实现，双端（Capacitor/Electron）共用；时间为 monotonic 时钟传入。
 */
export function locateInPlaylist(
  items: PlayableItem[],
  elapsedMs: number,
): { index: number; item: PlayableItem; progressMs: number } | null {
  if (items.length === 0) return null;
  const totalMs = items.reduce((sum, it) => sum + itemDuration(it) * 1000, 0);
  let pos = totalMs > 0 ? ((elapsedMs % totalMs) + totalMs) % totalMs : 0;
  for (let i = 0; i < items.length; i++) {
    const durMs = itemDuration(items[i]) * 1000;
    if (pos < durMs) return { index: i, item: items[i], progressMs: pos };
    pos -= durMs;
  }
  return { index: 0, item: items[0], progressMs: 0 };
}
