<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>日志审计（R7 全程留痕）</span>
        <el-input v-model="action" placeholder="按动作过滤，如 LOGIN" style="width: 220px" clearable @change="load" />
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
import { http } from '../api/http';

const items = ref<Array<Record<string, unknown>>>([]);
const total = ref(0);
const page = ref(1);
const action = ref('');
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = (await http.get(`/logs?page=${page.value}&pageSize=20${action.value ? `&action=${action.value}` : ''}`)) as unknown as { total: number; items: Array<Record<string, unknown>> };
    total.value = r.total; items.value = r.items;
  } finally { loading.value = false; }
}
function onPage(p: number): void { page.value = p; load(); }
onMounted(load);
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; }
.detail { font-size: 12px; color: #909399; word-break: break-all; }
</style>
