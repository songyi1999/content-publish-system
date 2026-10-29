<template>
  <el-card>
    <template #header>
      <div class="bar"><span>角色管理（RBAC）</span><el-button type="primary" @click="open()">新增角色</el-button></div>
    </template>
    <el-table :data="rows" border>
      <el-table-column prop="name" label="角色标识" width="130" />
      <el-table-column prop="remark" label="说明" width="220" />
      <el-table-column label="权限" min-width="240">
        <template #default="{ row }">
          <el-tag v-for="p in row.permissions" :key="p" size="small" style="margin: 2px">{{ p }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="userCount" label="用户数" width="80" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button size="small" @click="open(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑角色' : '新增角色'" width="480">
      <el-form label-width="90px">
        <el-form-item label="角色标识"><el-input v-model="dlg.form.name" :disabled="!!dlg.id" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="dlg.form.remark" /></el-form-item>
        <el-form-item label="权限">
          <el-select v-model="dlg.form.permissions" multiple style="width: 100%" placeholder="选择权限">
            <el-option v-for="p in PERMS" :key="p" :label="p" :value="p" />
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
import { ElMessage } from 'element-plus';
import { http } from '../api/http';

const PERMS = ['content:edit', 'content:submit', 'content:review', 'publish:manage', 'schedule:manage', 'device:manage', 'log:view'];
interface RoleRow { id: string; name: string; remark: string | null; permissions: string[]; userCount: number }
const rows = ref<RoleRow[]>([]);
const dlg = reactive({ visible: false, id: '', form: { name: '', remark: '', permissions: [] as string[] } });

async function load(): Promise<void> { rows.value = (await http.get('/roles')) as unknown as RoleRow[]; }
function open(row?: RoleRow): void {
  dlg.id = row?.id ?? '';
  dlg.form = { name: row?.name ?? '', remark: row?.remark ?? '', permissions: row ? [...row.permissions] : [] };
  dlg.visible = true;
}
async function save(): Promise<void> {
  if (dlg.id) await http.put(`/roles/${dlg.id}`, { remark: dlg.form.remark, permissions: dlg.form.permissions });
  else await http.post('/roles', dlg.form);
  dlg.visible = false; ElMessage.success('已保存'); load();
}
onMounted(load);
</script>

<style scoped>.bar { display: flex; justify-content: space-between; align-items: center; }</style>
