<template>
  <div>
    <el-row :gutter="12" class="stat-row">
      <el-col :span="6"><el-card shadow="never"><el-statistic title="终端在线 / 总数" :value="stats.devices" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="已发布内容（7日内更新）" :value="stats.publishedIn7d" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="待人工复审" :value="stats.contentsByStatus.MANUAL_REVIEW ?? 0" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="画面异常（累计）" :value="stats.screenshotAnomalies" /></el-card></el-col>
    </el-row>
    <el-card>
      <template #header>运营概览（SY-04，每 30 秒刷新）</template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="用户数">{{ stats.users }}</el-descriptions-item>
        <el-descriptions-item label="内容总数">{{ stats.contents }}</el-descriptions-item>
        <el-descriptions-item label="终端数">{{ stats.devices }}</el-descriptions-item>
        <el-descriptions-item label="草稿">{{ stats.contentsByStatus.DRAFT ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="已发布">{{ stats.contentsByStatus.PUBLISHED ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="已驳回">{{ stats.contentsByStatus.REJECTED ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="发布任务完成">{{ stats.tasksByStatus.DONE ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="待执行任务">{{ stats.tasksByStatus.PENDING ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="已撤回">{{ stats.tasksByStatus.REVOKED ?? 0 }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { http } from '../api/http';

interface StatsOverview { users: number; contents: number; devices: number; contentsByStatus: Record<string, number>; tasksByStatus: Record<string, number>; screenshotAnomalies: number; publishedIn7d: number }
const stats = ref<StatsOverview>({ users: 0, contents: 0, devices: 0, contentsByStatus: {}, tasksByStatus: {}, screenshotAnomalies: 0, publishedIn7d: 0 });
let timer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  stats.value = (await http.get('/stats/overview')) as unknown as StatsOverview;
}
onMounted(() => {
  load();
  timer = setInterval(load, 30_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.stat-row { margin-bottom: 12px; }
</style>
