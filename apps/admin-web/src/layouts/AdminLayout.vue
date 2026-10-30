<template>
  <el-container class="layout">
    <el-aside width="224px" class="aside">
      <div class="logo">
        <span class="logo-mark">CPS</span>
        <span>内容发布系统</span>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu router :default-active="active" class="menu" :default-openeds="opens">
          <el-menu-item index="/">
            <el-icon><Odometer /></el-icon>
            <span>工作台</span>
          </el-menu-item>
          <el-menu-item-group title="内容">
            <el-menu-item index="/columns"><el-icon><Files /></el-icon><span>栏目管理</span></el-menu-item>
            <el-menu-item index="/contents"><el-icon><Document /></el-icon><span>内容管理</span></el-menu-item>
            <el-menu-item index="/media"><el-icon><Picture /></el-icon><span>素材库</span></el-menu-item>
            <el-menu-item index="/programs"><el-icon><Film /></el-icon><span>节目编排</span></el-menu-item>
            <el-menu-item index="/schedules"><el-icon><Calendar /></el-icon><span>排期管理</span></el-menu-item>
          </el-menu-item-group>
          <el-menu-item-group title="运营">
            <el-menu-item index="/devices"><el-icon><Monitor /></el-icon><span>设备管理</span></el-menu-item>
            <el-menu-item index="/publish"><el-icon><Promotion /></el-icon><span>发布任务</span></el-menu-item>
          </el-menu-item-group>
          <el-menu-item-group title="审核与审计">
            <el-menu-item index="/review"><el-icon><CircleCheck /></el-icon><span>审核中心</span></el-menu-item>
            <el-menu-item index="/logs"><el-icon><Tickets /></el-icon><span>日志审计</span></el-menu-item>
          </el-menu-item-group>
          <el-menu-item-group title="系统">
            <el-menu-item index="/users"><el-icon><User /></el-icon><span>用户管理</span></el-menu-item>
            <el-menu-item index="/roles"><el-icon><Key /></el-icon><span>角色管理</span></el-menu-item>
            <el-menu-item index="/settings"><el-icon><Setting /></el-icon><span>系统设置</span></el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="header" height="56px">
        <div class="crumb">
          <span class="crumb-title">{{ title }}</span>
        </div>
        <el-dropdown @command="onCommand">
          <span class="user">
            <el-avatar :size="28" class="avatar">{{ auth.username.slice(0, 1).toUpperCase() }}</el-avatar>
            <span class="uname">{{ auth.username }}</span>
            <el-tag size="small" type="warning" effect="plain">{{ auth.role }}</el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Odometer, Files, Document, Picture, Film, Calendar, Monitor,
  Promotion, CircleCheck, Tickets, User, Key, Setting,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const active = computed(() => route.path);
const title = computed(() => TITLES[route.path] ?? '工作台');
const opens = ['内容', '运营', '审核与审计', '系统'];

const TITLES: Record<string, string> = {
  '/': '工作台',
  '/columns': '栏目管理',
  '/contents': '内容管理',
  '/media': '素材库',
  '/programs': '节目编排',
  '/schedules': '排期管理',
  '/devices': '设备管理',
  '/publish': '发布任务',
  '/review': '审核中心',
  '/logs': '日志审计',
  '/users': '用户管理',
  '/roles': '角色管理',
  '/settings': '系统设置',
};

function onCommand(cmd: string): void {
  if (cmd === 'logout') {
    auth.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.layout { height: 100%; }
.aside { background: #1c2534; display: flex; flex-direction: column; }
.logo { height: 56px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #fff; font-size: 15px; letter-spacing: 1px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); flex: none; }
.logo-mark { background: #d4875a; color: #fff; font-size: 12px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0; }
.menu-scroll { flex: 1; }
.menu { border-right: none; background: transparent; padding-bottom: 16px; }
.header { background: #fff; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 4px rgba(0, 21, 41, 0.06); position: relative; z-index: 5; }
.crumb-title { font-size: 15px; font-weight: 600; color: #303133; }
.user { display: flex; align-items: center; gap: 8px; cursor: pointer; outline: none; }
.uname { color: #303133; font-size: 13px; }
.avatar { background: #d4875a; color: #fff; font-size: 13px; }
.main { background: #f5f7fa; padding: 16px; overflow: auto; }
</style>

<style>
/* 侧边菜单配色（非 scoped：作用于 el-menu 内部节点） */
.layout .el-menu { background: transparent; border-right: none; }
.layout .el-menu-item { color: #c6cbd4; height: 44px; margin: 2px 8px; border-radius: 6px; }
.layout .el-menu-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.layout .el-menu-item.is-active { color: #fff; background: #d4875a; }
.layout .el-menu-item-group__title { color: #6b7280; font-size: 12px; padding: 14px 0 6px 20px; }
</style>
