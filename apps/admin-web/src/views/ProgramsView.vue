<template>
  <el-card>
    <template #header>
      <div class="bar"><span>节目编排（R11 模板化分屏）</span><el-button type="primary" @click="open()">新建节目</el-button></div>
    </template>
    <el-table :data="items" border>
      <el-table-column prop="name" label="节目名" width="180" />
      <el-table-column label="版式" width="160">
        <template #default="{ row }"><el-tag size="small">{{ LAYOUTS[row.layout as string] ?? row.layout }}</el-tag></template>
      </el-table-column>
      <el-table-column label="条目" min-width="280">
        <template #default="{ row }">
          <el-tag v-for="(it, i) in row.items" :key="i" size="small" style="margin: 2px">
            {{ i + 1 }}.{{ it.type }}{{ it.title ? `:${it.title}` : '' }}{{ it.durationSec ? `(${it.durationSec}s)` : '' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="open(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑节目' : '新建节目'" width="680" top="6vh">
      <el-form label-width="70px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="版式">
          <el-radio-group v-model="dlg.form.layout">
            <el-radio v-for="(v, k) in LAYOUTS" :key="k" :value="k">{{ v }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="条目">
          <div style="width: 100%">
            <div v-for="(it, i) in dlg.form.items" :key="i" class="item">
              <el-select v-model="it.type" style="width: 90px">
                <el-option value="image" label="图片" /><el-option value="video" label="视频" />
                <el-option value="text" label="文字" /><el-option value="web" label="网页" />
              </el-select>
              <el-input v-model="it.title" placeholder="标题/文字" style="width: 180px" />
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
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

const LAYOUTS: Record<string, string> = { full: '全屏', 'left-right': '左图右文', 'three-col': '三栏轮播', 'video-ticker': '视频+滚动字幕' };
interface Item { type: string; title?: string; durationSec?: number }
interface ProgramRow { id: string; name: string; layout: string; items: Array<{ type: string; title: string | null; durationSec: number | null }> }
const items = ref<ProgramRow[]>([]);
const dlg = reactive({ visible: false, id: '', form: { name: '', layout: 'full', items: [] as Item[] } });

async function load(): Promise<void> { items.value = (await http.get('/programs')) as unknown as ProgramRow[]; }
function open(row?: ProgramRow): void {
  dlg.id = row?.id ?? '';
  dlg.form = {
    name: row?.name ?? '',
    layout: row?.layout ?? 'full',
    items: row ? row.items.map((it) => ({ type: it.type, title: it.title ?? '', durationSec: it.durationSec ?? 10 })) : [],
  };
  dlg.visible = true;
}
async function save(): Promise<void> {
  if (dlg.id) await http.put(`/programs/${dlg.id}`, dlg.form);
  else await http.post('/programs', dlg.form);
  dlg.visible = false; ElMessage.success('已保存'); load();
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
.bar { display: flex; justify-content: space-between; }
.item { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
</style>
