<template>
  <el-container style="height: 100%">
    <el-aside width="220px" class="aside">
      <div class="logo">内容发布系统</div>
      <el-menu router default-active="/" class="menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span>欢迎，{{ auth.username }}（{{ auth.role }}）</span>
        <el-button link type="danger" @click="logout">退出登录</el-button>
      </el-header>
      <el-main>
        <el-row :gutter="12" style="margin-bottom: 12px">
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
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { http } from '../api/http';

const router = useRouter();
const auth = useAuthStore();

const menus = [
  { path: '/', title: '工作台' },
  { path: '/columns', title: '栏目管理' },
  { path: '/contents', title: '内容管理' },
  { path: '/media', title: '素材库' },
  { path: '/programs', title: '节目编排' },
  { path: '/schedules', title: '排期管理' },
  { path: '/devices', title: '设备管理' },
  { path: '/publish', title: '发布任务' },
  { path: '/review', title: '审核中心' },
  { path: '/logs', title: '日志审计' },
  { path: '/users', title: '用户管理' },
  { path: '/roles', title: '角色管理' },
  { path: '/settings', title: '系统设置' },
];

interface StatsOverview { users: number; contents: number; devices: number; contentsByStatus: Record<string, number>; tasksByStatus: Record<string, number>; screenshotAnomalies: number; publishedIn7d: number }
const stats = ref<StatsOverview>({ users: 0, contents: 0, devices: 0, contentsByStatus: {}, tasksByStatus: {}, screenshotAnomalies: 0, publishedIn7d: 0 });
let timer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  stats.value = (await http.get('/stats/overview')) as unknown as StatsOverview;
}
function logout(): void {
  auth.logout();
  router.push('/login');
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
.aside { background: #1a2330; }
.logo { height: 60px; line-height: 60px; text-align: center; color: #fff; font-size: 17px; letter-spacing: 2px; }
.menu { border-right: none; background: transparent; }
.header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e4e7ed; }
</style>

<style>
.el-menu-item { color: #c0c4cc !important; }
.el-menu-item.is-active { color: #fff !important; background: #d4875a !important; }
</style>
