<template>
  <div class="stage" @click="wake">
    <!-- 未激活：输入激活码（DV-01）。竖屏/窄窗口下纵向排列，避免横排溢出屏幕 -->
    <div v-if="phase === 'activating'" class="gate">
      <h2>内容发布终端</h2>
      <div class="form">
        <label for="gate-server">服务器地址</label>
        <input id="gate-server" v-model="serverUrl" placeholder="如 http://10.0.2.2:3000 或 http://192.168.1.10:3000" autocapitalize="off" spellcheck="false" />
        <label for="gate-code">激活码</label>
        <input id="gate-code" v-model="code" placeholder="管理后台 · 设备管理 中生成" @keyup.enter="doActivate" />
        <button @click="doActivate">激 活</button>
      </div>
      <p class="hint">安卓模拟器内 10.0.2.2 即电脑本机；也可填电脑局域网 IP</p>
      <p v-if="errMsg" class="err">{{ errMsg }}</p>
    </div>

    <!-- 同步中 -->
    <div v-else-if="phase === 'syncing'" class="gate">
      <h2>内容同步中…</h2>
      <p>{{ syncMsg }}</p>
      <p class="net" :class="{ offline: !online }">{{ online ? '已连接服务器' : '服务器不可达，稍后重试（离线播放不受影响）' }}</p>
    </div>

    <!-- 播放：按排期选节目，按版式渲染（R11/R12/R2/PD-02 区域配置） -->
    <div v-else class="player" :class="`layout-${currentLayout}`">
      <div class="zone-main" :style="zoneStyles.main">
        <template v-if="playing">
          <video v-if="playing.type === 'video' && playing.src" :src="playing.src" autoplay muted loop playsinline ref="videoEl" @error="next" />
          <img v-else-if="playing.type === 'image' && playing.src" :src="playing.src" ref="imgEl" />
          <div v-else-if="playing.html" class="rich" v-html="playing.html"></div>
          <div v-else class="text-slide">
            <h1>{{ playing.title ?? '' }}</h1>
          </div>
        </template>
      </div>
      <div v-if="showTicker" class="zone-ticker">
        <div class="ticker-inner">{{ tickerText }}</div>
      </div>
      <div v-if="showSide" class="zone-side" :style="zoneStyles.side">
        <div class="weather" v-if="zones.side?.showWeather !== false && weather">{{ weatherEmoji(weather.weatherCode) }} {{ weather.temperature }}℃</div>
        <div class="clock" v-if="zones.side?.showClock !== false">{{ clockTime }}</div>
        <div class="title">{{ programName }}</div>
      </div>
      <div v-if="showWeb" class="zone-web" :style="zoneStyles.web">
        <iframe :src="zones.web?.url" class="web-frame" />
      </div>
    </div>

    <!-- 定时关机遮罩（DV-10 A）：到点全黑并暂停媒体 -->
    <div v-if="phase === 'playing' && powerOff" class="power-mask"></div>

    <!-- 应用内更新提示（TC-09/10） -->
    <div v-if="phase === 'playing' && updateInfo" class="update-bar">
      <span>发现新版本 v{{ updateInfo.latest }}</span>
      <button @click.stop="installUpdate">立即安装</button>
      <button class="ghost" @click.stop="updateInfo = null">稍后</button>
    </div>

    <!-- 触摸导航（TC-03 基础交互）：点按呼出，选节目即切；60 秒无操作自动隐藏并回默认轮播 -->
    <div v-if="phase === 'playing' && navVisible" class="nav-bar">
      <div class="nav-item" :class="{ active: !manualProgramId }" @click.stop="pickManual('')">默认轮播</div>
      <div v-for="p in manifest?.programs ?? []" :key="p.id" class="nav-item" :class="{ active: manualProgramId === p.id }" @click.stop="pickManual(p.id)">{{ p.name }}</div>
    </div>

    <div v-if="phase === 'playing'" class="status">{{ online ? '' : '离线自治播放中 · ' }}{{ clockTime }}<span v-if="weather"> · {{ weatherEmoji(weather.weatherCode) }} {{ weather.temperature }}℃</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Manifest, TerminalConfig } from './api';
import { APP_VERSION, activate, connectHeartbeat, fetchManifest, fetchVersion, loadConfig, platformDefaultBaseUrl, report, uploadScreenshot } from './api';
import { clearAll, inDownloadWindow, syncItems, getMedia } from './cache';
import { locateInPlaylist, pickActiveSlot } from '@cps/player-core';
import { fetchWeather, weatherEmoji, type WeatherNow } from './weather';
import type { PlayableItem, Program, ProgramZones } from '@cps/shared';

type Phase = 'activating' | 'syncing' | 'playing';

const phase = ref<Phase>('activating');
const serverUrl = ref(platformDefaultBaseUrl());
const code = ref('');
const errMsg = ref('');
const syncMsg = ref('');
const online = ref(false);
const clockTime = ref('');
const manifest = ref<Manifest | null>(null);
const programName = ref('');
const playStart = ref(0);
const currentItems = ref<PlayableItem[]>([]);
const currentLayout = ref<Program['layout']>('full');
const currentZones = ref<ProgramZones>({});
const manualProgramId = ref<string | null>(null);
const navVisible = ref(false);
const tickerText = ref('欢迎使用内容集中发布系统');
const lastInteraction = ref(Date.now());
const weather = ref<WeatherNow | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

// 定时开关机（DV-10 A 方案）：到点全黑遮罩+暂停媒体，模拟关机；跨午夜区间支持
const powerOff = ref(false);
const updateInfo = ref<{ latest: string; url: string } | null>(null);
let powerPlan: { daysOfWeek?: number[]; onMinute?: number; offMinute?: number } | null = null;

function applyPowerPlan(p: { daysOfWeek?: number[]; onMinute?: number; offMinute?: number } | null): void {
  powerPlan = p && typeof p.offMinute === 'number' ? p : null;
  localStorage.setItem('cps.powerPlan', JSON.stringify(powerPlan));
  evalPowerPlan();
}

function evalPowerPlan(): void {
  if (!powerPlan) { powerOff.value = false; return; }
  const now = new Date();
  const days = powerPlan.daysOfWeek ?? [];
  if (days.length && !days.includes(now.getDay())) { powerOff.value = false; return; }
  const cur = now.getHours() * 60 + now.getMinutes();
  const on = powerPlan.onMinute ?? 0;
  const off = powerPlan.offMinute ?? 0;
  powerOff.value = off > on ? cur >= off || cur < on : cur >= off && cur < on;
}

watch(powerOff, (off) => {
  const v = videoEl.value;
  if (!v) return;
  if (off) v.pause();
  else void v.play().catch(() => undefined);
});

/** 应用内更新（TC-09/TC-10 Android）：提示安装，交给系统下载/安装器 */
async function checkUpdate(): Promise<void> {
  try {
    const v = await fetchVersion();
    if (!v.upToDate && (v.apkUrl || v.exeUrl)) updateInfo.value = { latest: v.latest, url: v.apkUrl || v.exeUrl };
  } catch { /* 离线容忍 */ }
}

function installUpdate(): void {
  if (updateInfo.value) window.open(updateInfo.value.url, '_blank');
}

/** 远程擦除（DV-04）：清空本地媒体与配置，回到激活页 */
async function wipeLocal(): Promise<void> {
  await clearAll().catch(() => undefined);
  localStorage.clear();
  location.reload();
}

let hb: ReturnType<typeof connectHeartbeat> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let shotTimer: ReturnType<typeof setInterval> | undefined;
let syncTimer: ReturnType<typeof setInterval> | undefined;

const playing = computed<{ type: string; src?: string; html?: string; title?: string } | null>(() => {
  const loc = locateInPlaylist(currentItems.value, Date.now() - playStart.value);
  const it = loc?.item;
  if (!it) return null;
  if (it.type === 'video' || it.type === 'image') {
    if (blobUrls.value.has(it.id)) return { type: it.type, src: blobUrls.value.get(it.id), title: it.title };
    return { type: 'text', title: it.title ?? it.id };
  }
  if (it.html) return { type: 'richtext', html: it.html, title: it.title };
  return { type: 'text', title: it.title ?? '' };
});

/** PD-02 区域配置渲染：侧栏/字幕/网页区独立开关与占比 */
const zones = computed(() => currentZones.value);
const webEnabled = computed(() => zones.value.web?.enabled === true && !!zones.value.web?.url);
const showTicker = computed(() => currentLayout.value === 'video-ticker' && zones.value.ticker?.enabled !== false);
const showSide = computed(() => {
  if (currentLayout.value !== 'left-right' && currentLayout.value !== 'three-col') return false;
  if (currentLayout.value === 'left-right') return zones.value.side?.enabled !== false && !webEnabled.value;
  return zones.value.side?.enabled !== false;
});
const showWeb = computed(() => webEnabled.value && (currentLayout.value === 'left-right' || currentLayout.value === 'three-col'));
const zoneStyles = computed(() => ({
  main: currentLayout.value === 'left-right' || currentLayout.value === 'three-col' ? { flex: String(zones.value.mainRatio ?? 3) } : undefined,
  side: { flex: String(zones.value.side?.ratio ?? 1) },
  web: { flex: String(zones.value.web?.ratio ?? 1) },
}));

const blobUrls = ref(new Map<string, string>());

function next(): void { playStart.value = Date.now() - 1e9; }

function wake(): void {
  lastInteraction.value = Date.now();
  if (phase.value === 'playing') navVisible.value = !navVisible.value;
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** 触摸切换节目（TC-03）：本地立即生效，60 秒无操作由计时器收回默认轮播 */
function pickManual(id: string): void {
  lastInteraction.value = Date.now();
  if (!id) { manualProgramId.value = null; applySchedule(); return; }
  const p = manifest.value?.programs.find((x) => x.id === id);
  if (!p) return;
  manualProgramId.value = id;
  currentItems.value = p.items;
  currentLayout.value = p.layout ?? 'full';
  currentZones.value = (p.zones ?? {}) as ProgramZones;
  programName.value = p.name;
  playStart.value = Date.now();
}

async function doActivate(): Promise<void> {
  errMsg.value = '';
  try {
    const cfg: TerminalConfig = await activate(serverUrl.value.replace(/\/$/, ''), code.value.trim());
    code.value = '';
    await afterConfig(cfg);
  } catch (e) {
    errMsg.value = '激活失败：' + (e as Error).message;
  }
}

async function afterConfig(_cfg: TerminalConfig): Promise<void> {
  phase.value = 'syncing';
  await syncLoop();
  startPlaying();
}

async function syncLoop(): Promise<void> {
  try {
    const m = await fetchManifest();
    const changed = m.version !== manifest.value?.version;
    manifest.value = m;
    online.value = true;
    if (changed) {
      syncMsg.value = '下载媒体文件…';
      await syncItems(m.contents.concat(...m.programs.map((p) => p.items)), (msg) => (syncMsg.value = msg), { downloadWindow: m.sync?.downloadWindow });
      for (const [id, old] of blobUrls.value) URL.revokeObjectURL(old);
      const map = new Map<string, string>();
      for (const item of m.contents.concat(...m.programs.map((p) => p.items))) {
        if (item.remoteUrl) {
          const blob = await getMedia(item.id).catch(() => undefined);
          if (blob) map.set(item.id, URL.createObjectURL(blob));
        }
      }
      blobUrls.value = map;
      await report('DOWNLOAD_DONE', { version: m.version });
    }
  } catch {
    online.value = false;
  }
}

/** 应用排期：优先级最高的生效节目，无排期回落默认内容（不黑屏） */
function applySchedule(): void {
  const m = manifest.value;
  if (!m) return;
  const active = pickActiveSlot(m.schedules, new Date());
  if (active) {
    const p = m.programs.find((x) => x.id === active.programId);
    if (p) {
      currentItems.value = p.items;
      currentLayout.value = p.layout ?? 'full';
      currentZones.value = (p.zones ?? {}) as ProgramZones;
      programName.value = p.name;
      playStart.value = Date.now();
      return;
    }
  }
  currentZones.value = {};
  currentLayout.value = 'full';
  programName.value = '默认轮播';
  if (currentItems.value !== m.contents) {
    currentItems.value = m.contents;
    playStart.value = Date.now();
  }
}

function startPlaying(): void {
  phase.value = 'playing';
  applySchedule();
  timer = setInterval(() => {
    clockTime.value = new Date().toLocaleString('zh-CN', { hour12: false });
    evalPowerPlan();
    // 无人交互 60 秒：退出手动节目与导航栏（TC-03），回默认排期
    if (Date.now() - lastInteraction.value > 60_000 && (manualProgramId.value || navVisible.value)) {
      manualProgramId.value = null;
      navVisible.value = false;
    }
    if (manualProgramId.value) return; // 手动选择的节目保持播放
    applySchedule();
  }, 1_000);
  syncTimer = setInterval(() => void syncLoop().then(applySchedule), 60_000);
  shotTimer = setInterval(() => void captureAndUpload(), 30 * 60_000); // 30 分钟监播（R14）
}

/** 监播截图：canvas 抓当前视频帧或图片（richtext 页面暂不采集） */
async function captureAndUpload(): Promise<void> {
  try {
    const el = (videoEl.value ?? imgEl.value) as HTMLVideoElement | HTMLImageElement | null;
    if (!el) return;
    const elAny = el as HTMLVideoElement & HTMLImageElement;
    const w = elAny.videoWidth || elAny.naturalWidth || 320;
    const h = elAny.videoHeight || elAny.naturalHeight || 240;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = Math.round((320 * h) / w) || 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.6));
    if (blob) await uploadScreenshot(blob);
  } catch {
    /* 截屏失败不影响播放 */
  }
}

onMounted(() => {
  clockTime.value = new Date().toLocaleString('zh-CN', { hour12: false });
  try { powerPlan = JSON.parse(localStorage.getItem('cps.powerPlan') ?? 'null'); } catch { powerPlan = null; }
  setTimeout(() => void checkUpdate(), 15_000);
  setInterval(() => void checkUpdate(), 6 * 3600_000);
  const refreshWeather = () => void fetchWeather().then((w) => (weather.value = w));
  refreshWeather();
  setInterval(refreshWeather, 30 * 60_000);
  const cfg = loadConfig();
  if (cfg) {
    serverUrl.value = cfg.baseUrl;
    void afterConfig(cfg);
    hb = connectHeartbeat({
      onUp: () => (online.value = true),
      onDown: () => (online.value = false),
      onCommand: (cmd) => {
        void report('CMD_RECEIVED', { type: cmd.type });
        if (cmd.type === 'publish' || cmd.type === 'unpublish') void syncLoop().then(applySchedule);
        else if (cmd.type === 'screenshot') void captureAndUpload();
        else if (cmd.type === 'set_power_plan') applyPowerPlan(cmd.payload as { daysOfWeek?: number[]; onMinute?: number; offMinute?: number } | null);
        else if (cmd.type === 'clear_cache') void wipeLocal();
        else if (cmd.type === 'update_app') void checkUpdate();
      },
    });
  }
});

onUnmounted(() => {
  hb?.close();
  if (timer) clearInterval(timer);
  if (shotTimer) clearInterval(shotTimer);
  if (syncTimer) clearInterval(syncTimer);
});
</script>

<style scoped>
.stage { width: 100vw; height: 100vh; background: #000; color: #fff; overflow: hidden; position: relative; }
.gate { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 0 18px; box-sizing: border-box; }
.gate .form { display: flex; flex-direction: column; gap: 6px; width: min(420px, 90vw); }
.gate .form label { font-size: 13px; color: #909399; align-self: flex-start; }
.gate input { padding: 10px 12px; font-size: 16px; border: 1px solid #555; background: #111; color: #fff; width: 100%; box-sizing: border-box; }
.gate button { padding: 12px 24px; font-size: 16px; background: #d4875a; border: none; color: #fff; cursor: pointer; margin-top: 10px; }
.hint { font-size: 12px; color: #6b6e73; text-align: center; }
.err { color: #f56c6c; }
.net { color: #909399; }
.net.offline { color: #e6a23c; }
.player { width: 100%; height: 100%; display: flex; flex-direction: column; }
.layout-left-right { flex-direction: row; }
.zone-main { flex: 1; display: flex; align-items: stretch; justify-content: center; overflow: hidden; }
.zone-main :deep(video), .zone-main img { width: 100%; height: 100%; object-fit: contain; }
.layout-left-right .zone-main { flex: 3; }
.zone-side { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #1a2330; }
.zone-side .clock { font-size: 7vh; }
.zone-side .title { font-size: 3vh; color: #d4875a; }
.zone-ticker { height: 7vh; background: #d4875a; overflow: hidden; display: flex; align-items: center; }
.ticker-inner { white-space: nowrap; font-size: 3.2vh; padding-left: 100%; animation: ticker 20s linear infinite; }
@keyframes ticker { to { transform: translateX(-100%); } }
.text-slide { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 5vw; text-align: center; padding: 4vw; }
.rich { flex: 1; overflow: auto; padding: 3vh 4vw; font-size: 2.6vh; background: #fff; color: #222; }
.rich :deep(img) { max-width: 100%; }
.status { position: absolute; right: 8px; bottom: 4px; font-size: 12px; color: rgba(255, 255, 255, 0.35); }
.nav-bar { position: absolute; left: 0; right: 0; bottom: 34px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; z-index: 10; padding: 0 12px; }
.nav-item { background: rgba(20, 20, 20, 0.82); border: 1px solid #555; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 16px; cursor: pointer; }
.nav-item.active { border-color: #d4875a; color: #d4875a; }
.zone-web { flex: 1; overflow: hidden; background: #fff; }
.web-frame { width: 100%; height: 100%; border: none; }
.power-mask { position: absolute; inset: 0; background: #000; z-index: 99; }
.update-bar { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(20, 24, 32, 0.92); color: #fff; padding: 8px 14px; border-radius: 8px; display: flex; gap: 10px; align-items: center; z-index: 20; font-size: 14px; }
.update-bar button { background: #d4875a; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.update-bar button.ghost { background: #555; }

/* 竖屏适配（ED-02）：左图右文版式在竖屏下改为上下布局，字号改用最小边基准 */
@media (orientation: portrait) {
  .layout-left-right { flex-direction: column; }
  .layout-left-right .zone-main { flex: 4; }
  .zone-side { flex: 1; flex-direction: row; justify-content: space-around; }
  .zone-side .clock { font-size: 4.5vh; }
  .text-slide { font-size: min(6vw, 5vh); }
}
</style>
