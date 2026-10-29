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

    <!-- 播放：按排期选节目，按版式渲染（R11/R12/R2） -->
    <div v-else class="player" :class="`layout-${currentLayout}`">
      <div class="zone-main">
        <template v-if="playing">
          <video v-if="playing.type === 'video' && playing.src" :src="playing.src" autoplay muted loop playsinline ref="videoEl" @error="next" />
          <img v-else-if="playing.type === 'image' && playing.src" :src="playing.src" ref="imgEl" />
          <div v-else-if="playing.html" class="rich" v-html="playing.html"></div>
          <div v-else class="text-slide">
            <h1>{{ playing.title ?? '' }}</h1>
          </div>
        </template>
      </div>
      <div v-if="currentLayout === 'video-ticker'" class="zone-ticker">
        <div class="ticker-inner">{{ tickerText }}</div>
      </div>
      <div v-if="currentLayout === 'left-right'" class="zone-side">
        <div class="weather" v-if="weather">{{ weatherEmoji(weather.weatherCode) }} {{ weather.temperature }}℃</div>
        <div class="clock">{{ clockTime }}</div>
        <div class="title">{{ programName }}</div>
      </div>
    </div>

    <div v-if="phase === 'playing'" class="status">{{ online ? '' : '离线自治播放中 · ' }}{{ clockTime }}<span v-if="weather"> · {{ weatherEmoji(weather.weatherCode) }} {{ weather.temperature }}℃</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Manifest, TerminalConfig } from './api';
import { activate, connectHeartbeat, fetchManifest, loadConfig, platformDefaultBaseUrl, report, uploadScreenshot } from './api';
import { syncItems, getMedia } from './cache';
import { locateInPlaylist, pickActiveSlot } from '@cps/player-core';
import { fetchWeather, weatherEmoji, type WeatherNow } from './weather';
import type { PlayableItem, Program } from '@cps/shared';

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
const tickerText = ref('欢迎使用内容集中发布系统');
const lastInteraction = ref(Date.now());
const weather = ref<WeatherNow | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

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

const blobUrls = ref(new Map<string, string>());

function next(): void { playStart.value = Date.now() - 1e9; }

function wake(): void {
  lastInteraction.value = Date.now();
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
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
      await syncItems(m.contents.concat(...m.programs.map((p) => p.items)), (msg) => (syncMsg.value = msg));
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
      programName.value = p.name;
      playStart.value = Date.now();
      return;
    }
  }
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
    applySchedule();
    // 无人交互 60 秒自动回默认节目（触摸场景）
    if (Date.now() - lastInteraction.value > 60_000 && currentLayout.value !== 'full') applySchedule();
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

/* 竖屏适配（ED-02）：左图右文版式在竖屏下改为上下布局，字号改用最小边基准 */
@media (orientation: portrait) {
  .layout-left-right { flex-direction: column; }
  .layout-left-right .zone-main { flex: 4; }
  .zone-side { flex: 1; flex-direction: row; justify-content: space-around; }
  .zone-side .clock { font-size: 4.5vh; }
  .text-slide { font-size: min(6vw, 5vh); }
}
</style>
