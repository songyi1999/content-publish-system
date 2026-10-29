import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 播放器产物路径：打包后在 resources/player-web，开发态指向 monorepo 构建产物 */
function playerIndex(): string {
  const packaged = join(process.resourcesPath, 'player-web', 'index.html');
  if (app.isPackaged && existsSync(packaged)) return packaged;
  return join(__dirname, '..', '..', 'player-web', 'dist', 'index.html');
}

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
  void win.loadFile(playerIndex());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 工控机场景常驻，不随窗口关闭退出（M5 接入看门狗后由其守护）
  if (process.platform !== 'darwin') app.quit();
});
