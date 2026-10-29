<template>
  <div class="player" @click="toggleFullscreen">
    <div class="zone-main">
      <!-- 演示模式：按 player-core 的循环定位渲染当前条目 -->
      <div v-if="current" class="slide" :key="current.item.id">
        <div v-if="current.item.type === 'video'" class="video">视频区（M5 接入本地 MP4）</div>
        <div v-else class="poster" :style="{ background: current.item.color }">
          <h1>{{ current.item.title }}</h1>
          <p>player-core locateInPlaylist → index {{ current.index }} · 进度 {{ Math.round(current.progressMs / 1000) }}s</p>
        </div>
      </div>
    </div>
    <div class="zone-ticker">
      <div class="ticker-inner">滚动字幕区（R11 节目编排演示） · {{ clock }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { locateInPlaylist } from '@cps/player-core';
import type { PlayableItem } from '@cps/shared';

interface DemoItem extends PlayableItem {
  color: string;
}

const demoItems: DemoItem[] = [
  { id: 'd1', type: 'text', title: '欢迎使用内容集中发布系统', durationSec: 8, color: '#1A2330' },
  { id: 'd2', type: 'image', title: '图片轮播位 01', durationSec: 6, color: '#2A4A3A' },
  { id: 'd3', type: 'text', title: '离线自治播放演示 · 断网不停播', durationSec: 8, color: '#4A2A3A' },
];

const elapsed = ref(0);
const clock = ref('');
let start = performance.now();
let timer: ReturnType<typeof setInterval> | undefined;

const current = computed(() =>
  locateInPlaylist(demoItems, elapsed.value) as { index: number; item: DemoItem; progressMs: number } | null,
);

onMounted(() => {
  timer = setInterval(() => {
    elapsed.value = performance.now() - start;
    clock.value = new Date().toLocaleString('zh-CN', { hour12: false });
  }, 500);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function toggleFullscreen(): void {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
}
</script>

<style scoped>
.player {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #000;
  color: #fff;
}
.zone-main {
  flex: 1;
  display: flex;
}
.slide {
  flex: 1;
  display: flex;
}
.poster,
.video {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 4vw;
}
.poster p {
  font-size: 1.6vw;
  opacity: 0.7;
}
.video {
  background: #101010;
  color: #888;
}
.zone-ticker {
  height: 8vh;
  overflow: hidden;
  background: #d4875a;
  display: flex;
  align-items: center;
}
.ticker-inner {
  white-space: nowrap;
  font-size: 3.5vh;
  padding-left: 100%;
  animation: ticker 18s linear infinite;
}
@keyframes ticker {
  to {
    transform: translateX(-100%);
  }
}
</style>
