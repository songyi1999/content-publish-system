<template>
  <el-container style="height: 100%">
    <el-aside width="220px" class="aside">
      <div class="logo">内容发布系统</div>
      <el-menu router default-active="/" class="menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <span>{{ m.title }}</span>
          <el-tag v-if="!m.ready" size="small" type="info" effect="plain" style="margin-left: 8px">开发中</el-tag>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span>欢迎，{{ auth.username }}（{{ auth.role }}）</span>
        <el-button link type="danger" @click="logout">退出登录</el-button>
      </el-header>
      <el-main>
        <el-card>
          <template #header>项目状态（M0 工程骨架已就绪）</template>
          <el-timeline>
            <el-timeline-item
              v-for="m in milestones"
              :key="m.name"
              :type="m.type"
              :timestamp="m.time"
            >
              {{ m.name }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const menus = [
  { path: '/', title: '工作台', ready: true },
  { path: '/columns', title: '栏目管理', ready: true },
  { path: '/contents', title: '内容管理', ready: true },
  { path: '/media', title: '素材库', ready: true },
  { path: '/programs', title: '节目编排', ready: true },
  { path: '/schedules', title: '排期管理', ready: true },
  { path: '/devices', title: '设备管理', ready: true },
  { path: '/publish', title: '发布任务', ready: true },
  { path: '/review', title: '审核中心', ready: true },
  { path: '/logs', title: '日志审计', ready: true },
  { path: '/users', title: '用户管理', ready: true },
  { path: '/roles', title: '角色管理', ready: true },
];

const milestones = [
  { name: 'M0 工程与 CI 就绪', time: '第 0.5 周', type: 'primary' },
  { name: 'M1 账号权限底座（RBAC/JWT/日志）', time: '第 1.5 周', type: 'default' },
  { name: 'M2 内容管理（栏目/素材/富文本）', time: '第 3 周', type: 'default' },
  { name: 'M3 多格式导入转码（docx/HTML/MP4）', time: '第 4 周', type: 'default' },
  { name: 'M4 设备与发布链路（心跳/下发/续传）', time: '第 6 周', type: 'default' },
  { name: 'M5 播放器内核与双端客户端', time: '第 8.5 周', type: 'default' },
  { name: 'M6 审核工作流 + AI', time: '第 9.5 周', type: 'default' },
  { name: 'M7 节目编排与排期基础版', time: '第 11 周', type: 'default' },
  { name: 'M8 终端运维增强（开关机/监播/更新）', time: '第 12.5 周', type: 'default' },
  { name: 'M9 联调测试与试点上线', time: '第 13.5 周', type: 'default' },
];

function logout(): void {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.aside {
  background: #1a2330;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 17px;
  letter-spacing: 2px;
}
.menu {
  border-right: none;
  background: transparent;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
}
</style>

<style>
.el-menu-item {
  color: #c0c4cc !important;
}
.el-menu-item.is-active {
  color: #fff !important;
  background: #d4875a !important;
}
</style>
