<template>
  <el-card>
    <template #header><span>审核中心（R6/R8：编辑-审核-发布分离）</span></template>
    <el-table :data="items" border v-loading="loading">
      <el-table-column prop="title" label="标题" min-width="180" />
      <el-table-column label="栏目" width="120">
        <template #default="{ row }">{{ row.column?.name ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="提交时间" width="170">
        <template #default="{ row }">{{ new Date(row.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="preview(row)">预览</el-button>
          <el-button size="small" type="success" @click="approve(row)">通过</el-button>
          <el-button size="small" type="danger" @click="reject(row)">驳回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-card shadow="never" style="margin-top: 12px">
      <template #header>
        <span>敏感词库（AI 初审 · R8）</span>
        <el-button size="small" style="float: right" @click="saveWords">保存词库</el-button>
      </template>
      <el-select v-model="words" multiple filterable allow-create default-first-option style="width: 100%" placeholder="输入后回车添加敏感词" />
    </el-card>

    <el-dialog v-model="previewDlg" :title="previewTitle" width="720" top="6vh">
      <div class="rich" v-html="previewHtml"></div>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

interface Row { id: string; title: string; column?: { name: string } | null; updatedAt: string }
const items = ref<Row[]>([]);
const loading = ref(false);
const words = ref<string[]>([]);
const previewDlg = ref(false);
const previewHtml = ref('');
const previewTitle = ref('');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = (await http.get('/review/pending')) as unknown as { items: Row[] };
    items.value = r.items;
  } finally { loading.value = false; }
}
async function preview(row: Row): Promise<void> {
  const c = (await http.get(`/contents/${row.id}`)) as unknown as { body?: { html?: string } };
  previewHtml.value = c.body?.html ?? '<p>（无正文）</p>';
  previewTitle.value = row.title;
  previewDlg.value = true;
}
async function approve(row: Row): Promise<void> {
  await http.post(`/review/${row.id}/approve`);
  ElMessage.success('已通过，可前往发布'); load();
}
async function reject(row: Row): Promise<void> {
  const r = await ElMessageBox.prompt('驳回原因（必填）', `驳回「${row.title}」`, { inputValidator: (v: string) => !!v?.trim() || '原因必填' }).catch(() => null);
  if (!r) return;
  await http.post(`/review/${row.id}/reject`, { reason: r.value });
  ElMessage.success('已驳回'); load();
}
async function saveWords(): Promise<void> {
  const r = (await http.post('/review/sensitive-words', { words: words.value })) as unknown as { count: number };
  ElMessage.success(`词库已保存（${r.count} 词）`);
}
onMounted(async () => {
  load();
  words.value = ((await http.get('/review/sensitive-words')) as unknown as string[]) ?? [];
});
</script>

<style scoped>
.rich { max-height: 60vh; overflow: auto; }
.rich :deep(img) { max-width: 100%; }
</style>
