/** 离线媒体缓存（R2）：IndexedDB 存 Blob，断网时以 blob: URL 播放 */
import type { PlayableItem } from '@cps/shared';

const DB = 'cps-player';
const STORE = 'media';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await open();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  const store = await tx('readwrite');
  await new Promise<void>((resolve, reject) => {
    const r = store.put(blob, id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function removeMedia(id: string): Promise<void> {
  const store = await tx('readwrite');
  store.delete(id);
}

/** 断点续传下载（M4 服务端支持 Range）：逐片拉取并校验完整性 */
export async function downloadWithResume(url: string, sha256: string | undefined, onProgress?: (pct: number) => void): Promise<Blob> {
  const head = await fetch(url);
  if (!head.ok) throw new Error(`download ${head.status}`);
  const total = Number(head.headers.get('content-length') ?? 0);
  const chunks: BlobPart[] = [];
  let got = 0;
  let res = head;
  while (true) {
    const reader = res.body?.getReader();
    if (!reader) break;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      if (total) onProgress?.(Math.round((got / total) * 100));
    }
    if (!total || got >= total) break;
    res = await fetch(url, { headers: { Range: `bytes=${got}-` } });
    if (res.status !== 206) break;
  }
  const blob = new Blob(chunks);
  if (sha256) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    if (Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('') !== sha256) {
      throw new Error('sha256 校验失败');
    }
  }
  return blob;
}

/** 同步清单：新内容下载入缓存，已下架内容清理（R2 断网自治的数据基础） */
export async function syncItems(items: PlayableItem[], onProgress?: (msg: string) => void): Promise<void> {
  const need = items.filter((i) => i.remoteUrl && (i.type === 'video' || i.type === 'image'));
  for (const item of need) {
    const cached = await getMedia(item.id);
    if (cached) continue;
    onProgress?.(`下载 ${item.title ?? item.id}`);
    const blob = await downloadWithResume(item.remoteUrl!, item.sha256);
    await putMedia(item.id, blob);
  }
  const valid = new Set(need.map((i) => i.id));
  for (const item of items) {
    if (!valid.has(item.id)) await removeMedia(item.id).catch(() => undefined);
  }
}
