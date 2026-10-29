import { app, BrowserWindow } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 播放器产物路径：打包后在 resources/player-web，开发态指向 monorepo 构建产物 */
function playerIndex(): string {
  const packaged = join(process.resourcesPath, 'player-web', 'index.html');
  if (app.isPackaged && existsSync(packaged)) return packaged;
  return join(__dirname, '..', '..', 'player-web', 'dist', 'index.html');
}

/** 开机自启（TC-07）：写 HKCU Run 注册表，卸载语义由 NSIS 负责 */
async function enableAutoStart(): Promise<void> {
  const exe = process.execPath;
  const reg = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  await run('reg', ['add', reg, '/v', 'CPSPlayer', '/t', 'REG_SZ', '/d', `"${exe}"`, '/f']).catch(() => undefined);
}

/** 看门狗（TC-08）：子进程模式自我守护——异常退出后拉起自身 */
function installWatchdog(): void {
  process.on('uncaughtException', () => {
    app.relaunch();
    app.exit(0);
  });
}

/** 定时开关机（R13）：powerPlan 由服务端指令写入 env 文件；到点执行 shutdown（Windows 计划关机） */
async function schedulePowerOff(offMinute: number): Promise<void> {
  const now = new Date();
  const target = new Date(now);
  target.setHours(Math.floor(offMinute / 60), offMinute % 60, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const sec = Math.max(60, Math.floor((target.getTime() - now.getTime()) / 1000));
  await run('shutdown', ['/s', '/t', String(sec)]).catch(() => undefined);
}

/** D8-A 内网 HTTPS：放行由本系统自签 CA（CPS Root CA）签发的服务端证书 */
app.on('certificate-error', (event, _wc, _url, _error, cert, callback) => {
  if (cert?.issuerName?.includes('CPS Root CA')) {
    event.preventDefault();
    callback(true);
    return;
  }
  callback(false);
});

function createWindow(): void {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(playerIndex());
}

app.whenReady().then(() => {
  installWatchdog();
  void enableAutoStart();
  const offMinute = Number(process.env.CPS_POWER_OFF_MINUTE || 0);
  if (offMinute > 0) void schedulePowerOff(offMinute);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* 自动更新（TC-10）：electron-updater 指向 GitHub Releases；
   仓库推送并发布首个 Release 后，设置 CPS_UPDATE_REPO=owner/repo 即生效 */
async function setupAutoUpdate(): Promise<void> {
  const repo = process.env.CPS_UPDATE_REPO;
  if (!repo) return;
  try {
    const autoUpdater = (await import('electron-updater' as string) as { autoUpdater: { setFeedURL: (o: unknown) => void; checkForUpdatesAndNotify: () => Promise<unknown> } }).autoUpdater;
    autoUpdater.setFeedURL({ provider: 'github', repo });
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => undefined), 6 * 3600_000);
  } catch {
    /* 未安装更新源时静默跳过 */
  }
}
void setupAutoUpdate();

// 保留 spawn 引用（未来外部看门狗进程使用）
void spawn;
