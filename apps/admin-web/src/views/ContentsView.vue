<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>内容管理</span>
        <div>
          <el-upload :show-file-list="false" :http-request="uploadTxt" accept=".txt">
            <el-button>导入 txt</el-button>
          </el-upload>
          <el-upload :show-file-list="false" :http-request="uploadDocx" accept=".docx">
            <el-button>导入 docx</el-button>
          </el-upload>
          <el-button @click="htmlDlg = true">导入 HTML</el-button>
          <el-button type="primary" @click="open()">新建内容</el-button>
        </div>
      </div>
    </template>

    <el-form inline>
      <el-form-item><el-input v-model="q.keyword" placeholder="标题搜索" clearable @change="load" /></el-form-item>
      <el-form-item>
        <el-select v-model="q.status" clearable placeholder="状态" style="width: 150px" @change="load">
          <el-option v-for="(v, k) in STATUS" :key="k" :label="v" :value="k" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-input v-model="q.tag" placeholder="按标签筛选（CM-05）" clearable style="width: 170px" @change="load" />
      </el-form-item>
    </el-form>

    <el-table :data="items" border v-loading="loading">
      <el-table-column prop="title" label="标题" min-width="200" />
      <el-table-column label="栏目" width="120">
        <template #default="{ row }">{{ row.column?.name ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }"><el-tag size="small">{{ row.type }}</el-tag></template>
      </el-table-column>
      <el-table-column label="标签" min-width="120">
        <template #default="{ row }">
          <el-tag v-for="t in row.tags ?? []" :key="t" size="small" type="warning" style="margin-right: 4px">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="置顶" width="70">
        <template #default="{ row }"><el-tag v-if="row.topped" size="small" type="danger">顶</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ STATUS[row.status] ?? row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="有效期" width="200">
        <template #default="{ row }">{{ fmtDate(row.validFrom) }} ~ {{ fmtDate(row.validTo) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="330">
        <template #default="{ row }">
          <el-button size="small" @click="open(row)">编辑</el-button>
          <el-button size="small" @click="showVersions(row)">历史</el-button>
          <el-button v-if="row.status === 'DRAFT' || row.status === 'REJECTED'" size="small" type="warning" @click="submit(row)">提交审核</el-button>
          <el-button v-if="row.status === 'PUBLISHED'" size="small" type="danger" @click="goPublish(row)">再次发布</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination style="margin-top: 12px" layout="prev, pager, next, total" :total="total" :page-size="20" :current-page="page" @current-change="(p: number) => { page = p; load(); }" />

    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑内容' : '新建内容'" width="760" top="6vh">
      <el-form label-width="80px">
        <el-form-item label="标题"><el-input v-model="dlg.form.title" /></el-form-item>
        <el-form-item label="栏目">
          <el-cascader v-model="dlg.form.columnPath" :options="columns" :props="{ label: 'name', value: 'id', checkStrictly: true }" clearable style="width: 100%" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="dlg.form.range" type="datetimerange" start-placeholder="开始（可空）" end-placeholder="结束（可空）" style="width: 100%" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="dlg.form.tags" multiple filterable allow-create default-first-option placeholder="输入后回车创建标签" style="width: 100%" />
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="dlg.form.topped" active-text="终端轮播置顶" />
        </el-form-item>
        <el-form-item label="正文">
          <div class="editor">
            <Toolbar :editor="editorRef" :defaultConfig="{}" mode="simple" />
            <Editor v-model="dlg.form.html" :defaultConfig="{ placeholder: '图文编辑（R4）' }" mode="simple" @onCreated="editorCreated" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="verDlg.visible" title="历史版本（修改前自动快照）" width="560">
      <el-table :data="verDlg.items" border size="small">
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button size="small" type="warning" @click="restoreVer(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="htmlDlg" title="导入 HTML" width="560">
      <el-input v-model="htmlInput.title" placeholder="标题" style="margin-bottom: 8px" />
      <el-input v-model="htmlInput.html" type="textarea" :rows="10" placeholder="粘贴 HTML（自动剥离脚本）" />
      <template #footer>
        <el-button @click="htmlDlg = false">取消</el-button>
        <el-button type="primary" @click="importHtml">导入</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import '@wangeditor/editor/dist/css/style.css';
import { http } from '../api/http';

const STATUS: Record<string, string> = {
  DRAFT: '草稿', AI_REVIEW: '待AI审核', MANUAL_REVIEW: '待人工复审',
  APPROVED: '审核通过', PUBLISHED: '已发布', REJECTED: '已驳回',
};
interface ContentRow { id: string; title: string; type: string; status: string; column?: { name: string } | null; validFrom: string | null; validTo: string | null; tags?: string[]; topped?: boolean }

const items = ref<ContentRow[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const q = reactive({ keyword: '', status: '', tag: '' });
const columns = ref<Array<{ id: string; name: string; children?: unknown[] }>>([]);
const editorRef = shallowRef();
const htmlDlg = ref(false);
const htmlInput = reactive({ title: '', html: '' });
const dlg = reactive({
  visible: false, id: '',
  form: { title: '', columnPath: [] as string[], range: null as [Date, Date] | null, html: '', tags: [] as string[], topped: false },
});

onBeforeUnmount(() => { editorRef.value?.destroy(); });

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = (await http.get(`/contents?page=${page.value}&pageSize=20&keyword=${q.keyword}&status=${q.status}&tag=${q.tag}`)) as unknown as { total: number; items: ContentRow[] };
    total.value = r.total; items.value = r.items;
  } finally { loading.value = false; }
}

function open(row?: ContentRow): void {
  dlg.id = row?.id ?? '';
  dlg.form = { title: row?.title ?? '', columnPath: [], range: null, html: '', tags: row?.tags ? [...row.tags] : [], topped: row?.topped ?? false };
  dlg.visible = true;
  if (row) {
    http.get(`/contents/${row.id}`).then((c) => {
      const detail = c as unknown as { body?: { html?: string }, columnId?: string, validFrom?: string, validTo?: string, tags?: string[], topped?: boolean };
      dlg.form.html = detail.body?.html ?? '';
      if (detail.columnId) dlg.form.columnPath = [detail.columnId];
      if (detail.validFrom && detail.validTo) dlg.form.range = [new Date(detail.validFrom), new Date(detail.validTo)];
      dlg.form.tags = detail.tags ?? [];
      dlg.form.topped = detail.topped ?? false;
    });
  }
}

async function save(): Promise<void> {
  const columnId = dlg.form.columnPath.length ? dlg.form.columnPath[dlg.form.columnPath.length - 1] : undefined;
  const payload = {
    title: dlg.form.title, columnId, type: 'richtext',
    body: { html: dlg.form.html },
    validFrom: dlg.form.range?.[0]?.toISOString(),
    validTo: dlg.form.range?.[1]?.toISOString(),
    tags: dlg.form.tags,
    topped: dlg.form.topped,
  };
  if (dlg.id) await http.put(`/contents/${dlg.id}`, payload);
  else await http.post('/contents', payload);
  dlg.visible = false; ElMessage.success('已保存（如需上屏请提交审核）'); load();
}

async function submit(row: ContentRow): Promise<void> {
  await http.post(`/contents/${row.id}/submit`);
  const r = (await http.post(`/review/${row.id}/ai`)) as unknown as { next: string };
  ElMessage.success(r.next === 'MANUAL_REVIEW' ? 'AI 初审通过，已进入人工复审' : 'AI 初审未通过，已驳回');
  load();
}

function uploadTxt(o: unknown): void { void doImport('txt', o as { file: File }); }
function uploadDocx(o: unknown): void { void doImport('docx', o as { file: File }); }
function editorCreated(e: unknown): void { editorRef.value = e; }

async function doImport(kind: 'txt' | 'docx', opt: { file: File }): Promise<void> {
  const fd = new FormData();
  fd.append('file', opt.file);
  await http.post(`/contents/import/${kind}`, fd);
  ElMessage.success(`已导入 ${opt.file.name}（草稿）`); load();
}

async function importHtml(): Promise<void> {
  if (!htmlInput.html) { ElMessage.warning('HTML 为空'); return; }
  await http.post('/contents/import/html', htmlInput);
  htmlDlg.value = false; ElMessage.success('已导入'); load();
}

async function remove(row: ContentRow): Promise<void> {
  await ElMessageBox.confirm(`确认删除「${row.title}」？`, '提示');
  const r = (await http.delete(`/contents/${row.id}`)) as unknown as { ok: boolean; message?: string };
  if (!r.ok) ElMessage.warning(r.message ?? '无法删除');
  load();
}

function goPublish(row: ContentRow): void {
  window.location.hash = `#/publish?contentId=${row.id}`;
}

function statusType(s: string): string {
  return { PUBLISHED: 'success', APPROVED: 'primary', REJECTED: 'danger' }[s] ?? 'info';
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '-';
}

const verDlg = reactive({ visible: false, contentId: '', items: [] as Array<{ id: string; title: string; createdAt: string }> });
async function showVersions(row: ContentRow): Promise<void> {
  verDlg.contentId = row.id;
  verDlg.items = (await http.get(`/contents/${row.id}/versions`)) as unknown as typeof verDlg.items;
  verDlg.visible = true;
}
async function restoreVer(v: { id: string }): Promise<void> {
  await ElMessageBox.confirm('恢复该版本后内容将回到草稿并需重新审核，确认？', '恢复版本');
  await http.post(`/contents/${verDlg.contentId}/versions/${v.id}/restore`);
  verDlg.visible = false; ElMessage.success('已恢复为草稿'); load();
}

onMounted(async () => {
  load();
  columns.value = (await http.get('/columns')) as unknown as typeof columns.value;
});
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; }
.bar > div:last-child { display: flex; gap: 8px; }
.editor { border: 1px solid #dcdfe6; z-index: 100; }
.editor :deep(.w-e-text-container) { height: 260px; }
</style>
