/**
 * 外部看门狗（TC-08 备用方案）：独立进程监测主程序，崩溃/被杀后重启。
 * 部署：将本脚本与主程序同机运行（计划任务开机启动）：
 *   node dist/watchdog.js
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const MAIN = join(__dirname, 'main.js');
const CHECK_MS = 10_000;

let child: ReturnType<typeof spawn> | null = null;

function start(): void {
  child = spawn(process.execPath, [MAIN], { stdio: 'inherit' });
  child.on('exit', () => {
    console.log('[watchdog] main exited, restarting in 10s');
    setTimeout(start, CHECK_MS);
  });
}

start();
