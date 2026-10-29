<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>节目编排（R11 模板化分屏 · PD-02 区域配置 · PD-03 模板）</span>
        <div>
          <el-button @click="tplDlg = true">从模板新建</el-button>
          <el-button type="primary" @click="open()">新建节目</el-button>
        </div>
      </div>
    </template>
    <el-table :data="items" border>
      <el-table-column prop="name" label="节目名" width="180" />
      <el-table-column label="类别" width="90">
        <template #default="{ row }"><el-tag size="small" :type="row.isTemplate ? 'warning' : 'success'">{{ row.isTemplate ? '模板' : '节目' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="版式" width="160">
        <template #default="{ row }"><el-tag size="small">{{ LAYOUTS[row.layout as string] ?? row.layout }}</el-tag></template>
      </el-table-column>
      <el-table-column label="区域" min-width="200">
        <template #default="{ row }">
          <el-tag v-if="row.zones?.web?.enabled" size="small" type="danger">网页区</el-tag>
          <el-tag v-if="row.zones?.side?.enabled !== false && row.layout !== 'full' && row.layout !== 'video-ticker'" size="small" type="info">侧栏</el-tag>
          <el-tag v-if="row.layout === 'video-ticker' && row.zones?.ticker?.enabled !== false" size="small">字幕</el-tag>
          <el-tag v-if="row.zones?.side?.showWeather" size="small" type="success">天气</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="条目" min-width="240">
        <template #default="{ row }">
          <el-tag v-for="(it, i) in row.items" :key="i" size="small" style="margin: 2px">
            {{ i + 1 }}.{{ it.type }}{{ it.title ? `:${it.title}` : '' }}{{ it.durationSec ? `(${it.durationSec}s)` : '' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250">
        <template #default="{ row }">
          <el-button size="small" @click="open(row)">编辑</el-button>
          <el-button size="small" type="warning" plain @click="saveAsTpl(row)">另存模板</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑节目' : '新建节目'" width="760" top="5vh">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="版式">
          <el-radio-group v-model="dlg.form.layout">
            <el-radio v-for="(v, k) in LAYOUTS" :key="k" :value="k">{{ v }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="主区占比">
          <el-slider v-model="dlg.form.zones.mainRatio" :min="1" :max="6" show-input style="max-width: 360px" />
          <span class="tip">主内容区 flex 权重（侧栏/网页区为 1）</span>
        </el-form-item>
        <el-form-item v-if="dlg.form.layout === 'left-right' || dlg.form.layout === 'three-col'" label="侧栏区">
          <el-checkbox v-model="dlg.form.zones.sideEnabled">启用侧栏（时钟/天气/节目名）</el-checkbox>
          <el-checkbox v-model="dlg.form.zones.sideShowClock">时钟</el-checkbox>
          <el-checkbox v-model="dlg.form.zones.sideShowWeather">天气</el-checkbox>
        </el-form-item>
        <el-form-item v-if="dlg.form.layout === 'video-ticker'" label="滚动字幕">
          <el-checkbox v-model="dlg.form.zones.tickerEnabled">启用底部滚动字幕</el-checkbox>
        </el-form-item>
        <el-form-item label="网页区">
          <el-switch v-model="dlg.form.zones.webEnabled" />
          <el-input v-if="dlg.form.zones.webEnabled" v-model="dlg.form.zones.webUrl" placeholder="https://example.com（内嵌网页，PD-02）" style="width: 380px; margin-left: 10px" />
        </el-form-item>
        <el-form-item label="条目">
          <div style="width: 100%">
            <div v-for="(it, i) in dlg.form.items" :key="i" class="item">
              <el-select v-model="it.type" style="width: 90px">
                <el-option value="image" label="图片" /><el-option value="video" label="视频" />
                <el-option value="text" label="文字" /><el-option value="web" label="网页" />
              </el-select>
              <el-input v-model="it.title" placeholder="标题/文字" style="width: 160px" />
              <el-input v-if="it.type === 'web'" v-model="it.url" placeholder="网页 URL" style="width: 200px" />
              <el-input-number v-model="it.durationSec" :min="3" :max="600" placeholder="秒" style="width: 110px" />
              <el-button size="small" type="danger" @click="dlg.form.items.splice(i, 1)">删除</el-button>
            </div>
            <el-button size="small" @click="dlg.form.items.push({ type: 'text', title: '', durationSec: 10 })">+ 添加条目</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tplDlg" title="从模板新建节目（PD-03）" width="560">
      <el-table :data="templates" border size="small" v-loading="tplLoading">
        <el-table-column prop="name" label="模板" min-width="200" />
        <el-table-column label="版式" width="140">
          <template #default="{ row }">{{ LAYOUTS[row.layout as string] ?? row.layout }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="fromTemplate(row)">使用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

const LAYOUTS: Record<string, string> = { full: '全屏', 'left-right': '左图右文', 'three-col': '三栏轮播', 'video-ticker': '视频+滚动字幕' };
interface Item { type: string; title?: string; durationSec?: number; url?: string }
interface ZoneCfg { sideEnabled: boolean; sideShowClock: boolean; sideShowWeather: boolean; tickerEnabled: boolean; webEnabled: boolean; webUrl: string; mainRatio: number }
interface ProgramRow {
  id: string; name: string; layout: string; isTemplate?: boolean;
  items: Array<{ type: string; title: string | null; durationSec: number | null; body?: { url?: string } | null }>;
  zones?: Record<string, unknown> | null;
}
const items = ref<ProgramRow[]>([]);
const templates = ref<ProgramRow[]>([]);
const tplDlg = ref(false);
const tplLoading = ref(false);
const dlg = reactive({ visible: false, id: '', form: { name: '', layout: 'full', items: [] as Item[], zones: blankZones() } });

function blankZones(): ZoneCfg {
  return { sideEnabled: true, sideShowClock: true, sideShowWeather: true, tickerEnabled: true, webEnabled: false, webUrl: '', mainRatio: 3 };
}
function toFormZones(z?: Record<string, unknown> | null): ZoneCfg {
  const s = (z?.side ?? {}) as { enabled?: boolean; showClock?: boolean; showWeather?: boolean };
  const t = (z?.ticker ?? {}) as { enabled?: boolean };
  const w = (z?.web ?? {}) as { enabled?: boolean; url?: string };
  return {
    sideEnabled: s.enabled !== false, sideShowClock: s.showClock !== false, sideShowWeather: s.showWeather !== false,
    tickerEnabled: t.enabled !== false, webEnabled: w.enabled === true, webUrl: w.url ?? '',
    mainRatio: typeof z?.mainRatio === 'number' ? (z.mainRatio as number) : 3,
  };
}
function toPayloadZones(f: ZoneCfg): Record<string, unknown> {
  return {
    side: { enabled: f.sideEnabled, showClock: f.sideShowClock, showWeather: f.sideShowWeather },
    ticker: { enabled: f.tickerEnabled },
    web: { enabled: f.webEnabled, url: f.webUrl || undefined },
    mainRatio: f.mainRatio,
  };
}

async function load(): Promise<void> { items.value = (await http.get('/programs')) as unknown as ProgramRow[]; }
async function openTemplates(): Promise<void> {
  tplDlg.value = true; tplLoading.value = true;
  try {
    templates.value = ((await http.get('/programs')) as unknown as ProgramRow[]).filter((p) => p.isTemplate);
  } finally { tplLoading.value = false; }
}
function open(row?: ProgramRow): void {
  dlg.id = row?.id ?? '';
  dlg.form = {
    name: row?.name ?? '',
    layout: row?.layout ?? 'full',
    items: row ? row.items.map((it) => ({ type: it.type, title: it.title ?? '', durationSec: it.durationSec ?? 10, url: it.body?.url ?? '' })) : [],
    zones: toFormZones(row?.zones),
  };
  dlg.visible = true;
}
function fromTemplate(tpl: ProgramRow): void {
  tplDlg.value = false;
  dlg.id = '';
  dlg.form = {
    name: tpl.name.replace(/（模板）$/, '') + '-' + new Date().toISOString().slice(5, 10),
    layout: tpl.layout,
    items: tpl.items.map((it) => ({ type: it.type, title: it.title ?? '', durationSec: it.durationSec ?? 10, url: it.body?.url ?? '' })),
    zones: toFormZones(tpl.zones),
  };
  dlg.visible = true;
}
async function save(): Promise<void> {
  const payload = {
    name: dlg.form.name,
    layout: dlg.form.layout,
    zones: toPayloadZones(dlg.form.zones),
    items: dlg.form.items.map((it) => ({ type: it.type, title: it.title || undefined, durationSec: it.durationSec, body: it.type === 'web' && it.url ? { url: it.url } : undefined })),
  };
  if (dlg.id) await http.put(`/programs/${dlg.id}`, payload);
  else await http.post('/programs', payload);
  dlg.visible = false; ElMessage.success('已保存'); load();
}
async function saveAsTpl(row: ProgramRow): Promise<void> {
  await ElMessageBox.confirm(`将「${row.name}」另存为模板？模板不出现在终端清单。`, '另存为模板（PD-03）');
  await http.post(`/programs/${row.id}/save-as-template`);
  ElMessage.success('已另存为模板'); load();
}
async function remove(row: ProgramRow): Promise<void> {
  await ElMessageBox.confirm(`确认删除节目「${row.name}」？`, '提示');
  const r = (await http.delete(`/programs/${row.id}`)) as unknown as { ok: boolean; message?: string };
  if (!r.ok) ElMessage.warning(r.message ?? '无法删除');
  load();
}
onMounted(load);
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; }
.bar > div { display: flex; gap: 8px; }
.item { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
.tip { font-size: 12px; color: #909399; margin-left: 8px; }
</style>
