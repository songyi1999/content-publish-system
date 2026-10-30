<template>
  <el-card>
    <template #header>
      <div class="bar"><span>栏目管理</span>
        <div>
          <el-button type="primary" @click="open()">新增根栏目</el-button>
          <el-button @click="open(selected)">新增子栏目</el-button>
        </div>
      </div>
    </template>
    <el-tree :data="tree" node-key="id" default-expand-all highlight-current @node-click="onNodeClick" :props="{ label: 'name', children: 'children' }">
      <template #default="{ data }">
        <span class="node">
          <span class="node-name">{{ data.name }} <el-tag v-if="!data.enabled" size="small" type="info">停用</el-tag></span>
          <span class="count">{{ (data.children ?? []).length }} 子栏目 · {{ data._count?.contents ?? 0 }} 内容</span>
          <span class="node-ops">
            <el-button size="small" link type="primary" @click.stop="edit(data)">编辑</el-button>
            <el-button size="small" link type="danger" @click.stop="remove(data)">删除</el-button>
          </span>
        </span>
      </template>
    </el-tree>

    <el-dialog v-model="dlg.visible" :title="dlg.parentName ? `在「${dlg.parentName}」下新增栏目` : '新增栏目'" width="420">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="dlg.form.sort" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="dlg.form.enabled" /></el-form-item>
        <el-form-item label="可见分组">
          <el-select v-model="dlg.form.groupIds" multiple style="width: 100%" placeholder="不选 = 全部终端可见">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
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

interface TreeRow { id: string; name: string; parentId: string | null; sort: number; enabled: boolean; groupIds?: string[]; children: TreeRow[]; _count?: { contents: number } }
const tree = ref<TreeRow[]>([]);
const selected = ref<TreeRow | null>(null);
const dlg = reactive({ visible: false, id: '', parentId: '', parentName: '', form: { name: '', sort: 0, enabled: true, groupIds: [] as string[] } });
const groups = ref<Array<{ id: string; name: string }>>([]);

async function load(): Promise<void> { tree.value = (await http.get('/columns')) as unknown as TreeRow[]; }
function onNodeClick(n: unknown): void { selected.value = n as TreeRow; }
function open(node?: TreeRow | null): void {
  dlg.id = ''; dlg.parentId = node?.id ?? ''; dlg.parentName = node?.name ?? '';
  dlg.form = { name: '', sort: 0, enabled: true, groupIds: [] };
  dlg.visible = true;
}
function edit(node: TreeRow): void {
  dlg.id = node.id; dlg.parentId = ''; dlg.parentName = '';
  dlg.form = { name: node.name, sort: node.sort, enabled: node.enabled, groupIds: [...(node.groupIds ?? [])] };
  dlg.visible = true;
}
async function save(): Promise<void> {
  if (!dlg.form.name) { ElMessage.warning('名称必填'); return; }
  if (dlg.id) await http.put(`/columns/${dlg.id}`, dlg.form);
  else await http.post('/columns', { name: dlg.form.name, parentId: dlg.parentId || undefined, sort: dlg.form.sort, groupIds: dlg.form.groupIds });
  dlg.visible = false; ElMessage.success('已保存'); load();
}
async function remove(node: TreeRow): Promise<void> {
  await ElMessageBox.confirm(`确认删除栏目「${node.name}」？`, '提示');
  const r = (await http.delete(`/columns/${node.id}`)) as unknown as { ok: boolean; message?: string };
  if (!r.ok) ElMessage.warning(r.message ?? '无法删除');
  else ElMessage.success('已删除');
  load();
}
onMounted(async () => {
  load();
  groups.value = (await http.get('/device-groups')) as unknown as typeof groups.value;
});
defineExpose({ edit });
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; }
.node { display: flex; align-items: center; gap: 8px; }
.count { font-size: 12px; color: #909399; }
.node { display: flex; align-items: center; gap: 12px; flex: 1; padding-right: 8px; }
.node-name { font-weight: 600; color: #303133; display: inline-flex; align-items: center; gap: 6px; }
.count { color: #909399; font-size: 12px; }
.node-ops { margin-left: auto; opacity: 0; transition: opacity 0.15s; }
:deep(.el-tree-node__content:hover) .node-ops { opacity: 1; }
</style>
