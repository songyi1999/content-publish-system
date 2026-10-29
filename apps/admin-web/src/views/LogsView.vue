<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>日志审计（R7 全程留痕）</span>
        <div class="filters">
          <el-select v-model="type" clearable placeholder="日志类型" style="width: 140px" @change="load">
            <el-option v-for="t in TYPES" :key="t.v" :label="t.label" :value="t.v" />
          </el-select>
          <el-input v-model="action" placeholder="动作关键字" style="width: 160px" clearable @change="load" />
          <el-input v-model="username" placeholder="操作人" style="width: 120px" clearable @change="load" />
          <el-date-picker v-model="range" type="datetimerange" start-placeholder="开始" end-placeholder="结束" style="width: 340px" @change="load" />
          <el-button @click="exportCsv">导出 CSV</el-button>
        </div>
      </div>
    </template>
    <el-table :data="items" border v-loading="loading">
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
      </el-table-column>
      <el-table-column prop="username" label="操作人" width="110" />
      <el-table-column prop="action" label="动作" width="170">
        <template #default="{ row }"><el-tag size="small" :type="row.action.includes('FAIL') || row.action.includes('ANOMALY') ? 'danger' : 'info'">{{ row.action }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130" />
      <el-table-column label="明细" min-width="260">
        <template #default="{ row }"><span class="detail">{{ JSON.stringify(row.detail ?? {}) }}</span></template>
      </el-table-column>
    </el-table>
    <el-pagination style="margin-top: 12px" layout="prev, pager, next, total" :total="total" :page-size="20" :current-page="page" @current-change="onPage" />
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http, getRaw } from '../api/http';

/** 日志类型（LG-05）：按动作前缀归类检索 */
const TYPES = [
  { v: 'LOGIN', label: '登录日志' },
  { v: 'CONTENT', label: '内容操作' },
  { v: 'PUBLISH', label: '发布操作' },
  { v: 'DEVICE', label: '终端事件' },
  { v: 'AI', label: 'AI 审核' },
  { v: 'PARAM', label: '参数变更' },
] as const;

const items = ref<Array<Record<string, unknown>>>([]);
const total = ref(0);
const page = ref(1);
const action = ref('');
const username = ref('');
const type = ref('');
const range = ref<[Date, Date] | null>(null);
const loading = ref(false);

function qs(): string {
  const p = new URLSearchParams();
  if (action.value) p.set('action', action.value);
  if (username.value) p.set('username', username.value);
  if (range.value) {
    p.set('from', range.value[0].toISOString());
    p.set('to', range.value[1].toISOString());
  }
  return p.toString();
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const t = type.value ? `&action=${type.value}` : '';
    const r = (await http.get(`/logs?page=${page.value}&pageSize=20${t}&${qs()}`)) as unknown as { total: number; items: Array<Record<string, unknown>> };
    total.value = r.total; items.value = r.items;
  } finally { loading.value = false; }
}

async function exportCsv(): Promise<void> {
  const t = type.value ? `&action=${type.value}` : '';
  const blob = await getRaw(`/logs/export?${t}&${qs()}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success('已导出');
}

function onPage(p: number): void { page.value = p; load(); }
onMounted(load);
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.detail { font-size: 12px; color: #909399; word-break: break-all; }
</style>
