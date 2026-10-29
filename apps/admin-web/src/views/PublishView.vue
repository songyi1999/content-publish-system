<template>
  <el-card>
    <template #header>
      <div class="bar"><span>发布任务（R1：全部/分组/指定 · 立即/定时/批量）</span>
        <el-button type="primary" @click="open()">创建发布</el-button>
      </div>
    </template>
    <el-table :data="items" border v-loading="loading">
      <el-table-column label="内容" min-width="180">
        <template #default="{ row }">{{ row.content?.title ?? row.contentId }}</template>
      </el-table-column>
      <el-table-column label="对象" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ { ALL: '全部终端', GROUP: '分组', DEVICE: '指定终端' }[row.targetType as string] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="{ DONE: 'success', PENDING: 'warning', REVOKED: 'info', FAILED: 'danger' }[row.status as string] ?? 'info'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button v-if="row.status === 'DONE'" size="small" type="danger" @click="revoke(row)">撤回</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination style="margin-top: 12px" layout="prev, pager, next, total" :total="total" :page-size="20" :current-page="page" @current-change="(p: number) => { page = p; load(); }" />

    <el-dialog v-model="dlg.visible" title="创建发布任务" width="520">
      <el-form label-width="90px">
        <el-form-item label="内容">
          <el-select v-model="dlg.form.contentId" filterable style="width: 100%" placeholder="仅显示审核通过/已发布内容">
            <el-option v-for="c in approved" :key="c.id" :label="c.title" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发布对象">
          <el-radio-group v-model="dlg.form.targetType">
            <el-radio value="ALL">全部终端</el-radio>
            <el-radio value="GROUP">按分组</el-radio>
            <el-radio value="DEVICE">指定终端</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="dlg.form.targetType === 'GROUP'" label="分组">
          <el-select v-model="dlg.form.targetIds" multiple style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dlg.form.targetType === 'DEVICE'" label="终端">
          <el-select v-model="dlg.form.targetIds" multiple style="width: 100%">
            <el-option v-for="d in devices" :key="d.id" :label="`${d.name ?? d.code}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发布方式">
          <el-radio-group v-model="dlg.form.mode">
            <el-radio value="now">立即</el-radio>
            <el-radio value="scheduled">定时</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="dlg.form.mode === 'scheduled'" label="生效时间">
          <el-date-picker v-model="dlg.form.startAt" type="datetime" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" @click="save">发布</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

interface Task { id: string; contentId: string; content?: { title: string } | null; targetType: string; status: string; createdAt: string }
const items = ref<Task[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const approved = ref<Array<{ id: string; title: string }>>([]);
const groups = ref<Array<{ id: string; name: string }>>([]);
const devices = ref<Array<{ id: string; code: string; name: string | null }>>([]);
const dlg = reactive({
  visible: false,
  form: { contentId: '', targetType: 'ALL', targetIds: [] as string[], mode: 'now', startAt: null as Date | null },
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = (await http.get(`/publish-tasks?page=${page.value}&pageSize=20`)) as unknown as { total: number; items: Task[] };
    total.value = r.total; items.value = r.items;
  } finally { loading.value = false; }
}
function open(): void {
  dlg.form = { contentId: '', targetType: 'ALL', targetIds: [], mode: 'now', startAt: null };
  dlg.visible = true;
}
async function save(): Promise<void> {
  if (!dlg.form.contentId) { ElMessage.warning('请选择内容'); return; }
  await http.post('/publish-tasks', {
    contentId: dlg.form.contentId,
    targetType: dlg.form.targetType,
    targetIds: dlg.form.targetIds,
    mode: dlg.form.mode,
    startAt: dlg.form.startAt?.toISOString(),
  });
  dlg.visible = false; ElMessage.success('发布任务已创建'); load();
}
async function revoke(row: Task): Promise<void> {
  await ElMessageBox.confirm('撤回后终端将同步删除该内容', '确认撤回');
  await http.post(`/publish-tasks/${row.id}/revoke`);
  ElMessage.success('已撤回'); load();
}
onMounted(async () => {
  load();
  const c = (await http.get('/contents?status=APPROVED&pageSize=100')) as unknown as { items: Array<{ id: string; title: string }> };
  const p = (await http.get('/contents?status=PUBLISHED&pageSize=100')) as unknown as { items: Array<{ id: string; title: string }> };
  approved.value = [...c.items, ...p.items];
  groups.value = (await http.get('/device-groups')) as unknown as typeof groups.value;
  devices.value = (await http.get('/devices')) as unknown as typeof devices.value;
});
</script>

<style scoped>.bar { display: flex; justify-content: space-between; align-items: center; }</style>
