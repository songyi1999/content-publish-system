/** 终端侧服务端通信：激活、心跳（WebSocket）、清单、上报、监播 */
import { io } from 'socket.io-client';
import type { DeviceCommand, PlayableItem, Program, ScheduleSlot } from '@cps/shared';

const CONF_KEY = 'cps.device';
/** 终端应用版本（心跳与更新检查上报） */
export const APP_VERSION = '1.2.0';

export interface TerminalConfig {
  baseUrl: string;
  deviceKey: string;
  deviceCode: string;
}

export function loadConfig(): TerminalConfig | null {
  const raw = localStorage.getItem(CONF_KEY);
  return raw ? (JSON.parse(raw) as TerminalConfig) : null;
}

export function saveConfig(cfg: TerminalConfig): void {
  localStorage.setItem(CONF_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(CONF_KEY);
}

/** 未配置时的默认服务器地址（Electron file:// 场景配置后覆盖） */
export function defaultBaseUrl(): string {
  const saved = loadConfig();
  if (saved?.baseUrl) return saved.baseUrl;
  const u = new URL(location.origin);
  return u.protocol === 'file:' ? 'http://127.0.0.1:3000' : u.origin;
}

/** 激活表单预填：安卓 WebView（Capacitor）内 127.0.0.1 是设备自身，10.0.2.2 才是宿主电脑 */
export function platformDefaultBaseUrl(): string {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return 'http://10.0.2.2:3000';
  return 'http://127.0.0.1:3000';
}

async function req(base: string, path: string, init?: RequestInit): Promise<Response> {
  const key = loadConfig()?.deviceKey;
  const res = await fetch(base + path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(key ? { 'x-device-key': key } : {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res;
}

export async function activate(baseUrl: string, activateCode: string): Promise<TerminalConfig> {
  const res = await req(baseUrl, '/api/device-api/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activateCode }),
  });
  const data = (await res.json()) as { deviceKey: string; deviceCode: string };
  const cfg = { baseUrl, deviceKey: data.deviceKey, deviceCode: data.deviceCode };
  saveConfig(cfg);
  return cfg;
}

export interface Manifest {
  contents: PlayableItem[];
  programs: Program[];
  schedules: ScheduleSlot[];
  version: string;
  /** 错峰下载窗口（PB-10）：窗口外终端暂停媒体下载 */
  sync?: { downloadWindow?: string };
}

export async function fetchManifest(): Promise<Manifest> {
  const base = defaultBaseUrl();
  const res = await req(base, '/api/device-api/manifest');
  return (await res.json()) as Manifest;
}

export async function report(event: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    await req(defaultBaseUrl(), '/api/device-api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, detail }),
    });
  } catch {
    /* 离线容忍：上报失败不阻断播放 */
  }
}

/** 版本检查（TC-09）：返回灰度解析后的最新版与安装包地址 */
export async function fetchVersion(): Promise<{ latest: string; apkUrl: string; exeUrl: string; upToDate: boolean }> {
  const key = loadConfig()?.deviceKey;
  const base = defaultBaseUrl();
  const res = await fetch(`${base}/api/device-api/version`, { headers: { 'x-app-version': APP_VERSION, ...(key ? { 'x-device-key': key } : {}) } });
  if (!res.ok) throw new Error(`version -> ${res.status}`);
  return (await res.json()) as { latest: string; apkUrl: string; exeUrl: string; upToDate: boolean };
}

/** 心跳长连接（R3）：30 秒一次，接收指令（发布/截屏/重启等） */
export function connectHeartbeat(handlers: { onCommand: (cmd: DeviceCommand) => void; onUp: () => void; onDown: () => void }) {
  const cfg = loadConfig();
  if (!cfg) return;
  const base = new URL(cfg.baseUrl);
  // 网关 namespace /device，engine path 保持默认 /socket.io（此前路径拼错导致终端心跳从未连上）
  const socket = io(`${cfg.baseUrl}/device`, { path: '/socket.io', transports: ['websocket', 'polling'] });
  void base;
  const beat = () => socket.emit('device:heartbeat', { deviceCode: cfg.deviceCode, appVersion: APP_VERSION });
  socket.on('connect', () => { beat(); handlers.onUp(); });
  socket.on('disconnect', () => handlers.onDown());
  socket.on('device:command', (cmd: DeviceCommand) => handlers.onCommand(cmd));
  const timer = setInterval(beat, 30_000);
  return { close: () => { clearInterval(timer); socket.close(); }, socket };
}

/** 监播截图上传（R14） */
export async function uploadScreenshot(blob: Blob): Promise<void> {
  const fd = new FormData();
  fd.append('file', blob, 'screen.jpg');
  try {
    await req(defaultBaseUrl(), '/api/device-api/screenshot', { method: 'POST', body: fd });
  } catch {
    /* 离线容忍 */
  }
}
