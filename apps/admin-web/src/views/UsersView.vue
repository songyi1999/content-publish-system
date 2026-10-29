<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>用户管理</span>
        <el-button type="primary" @click="openCreate">新增用户</el-button>
      </div>
    </template>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column prop="displayName" label="姓名" width="150" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }"><el-tag>{{ row.role || '未分配' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="enabled" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" @click="resetPwd(row)">重置密码</el-button>
          <el-button size="small" :type="row.enabled ? 'danger' : 'success'" @click="toggle(row)">
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.isCreate ? '新增用户' : '编辑用户'" width="440">
      <el-form label-width="90px">
        <el-form-item label="用户名" v-if="dlg.isCreate">
          <el-input v-model="dlg.form.username" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="dlg.form.displayName" />
        </el-form-item>
        <el-form-item label="初始密码" v-if="dlg.isCreate">
          <el-input v-model="dlg.form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="dlg.form.roleId" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="`${r.name}（${r.remark ?? ''}）`" :value="r.id" />
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

interface UserRow { id: string; username: string; displayName: string | null; role: string | null; roleId: string | null; enabled: boolean }
const rows = ref<UserRow[]>([]);
const roles = ref<Array<{ id: string; name: string; remark: string | null }>>([]);
const loading = ref(false);
const dlg = reactive({
  visible: false, isCreate: true, id: '',
  form: { username: '', displayName: '', password: '', roleId: '' },
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = (await http.get('/users')) as unknown as UserRow[];
    roles.value = (await http.get('/roles')) as unknown as typeof roles.value;
  } finally { loading.value = false; }
}

function openCreate(): void {
  dlg.isCreate = true; dlg.id = ''; dlg.visible = true;
  dlg.form = { username: '', displayName: '', password: '', roleId: roles.value.find((r) => r.name === 'editor')?.id ?? '' };
}
function openEdit(row: UserRow): void {
  dlg.isCreate = false; dlg.id = row.id; dlg.visible = true;
  dlg.form = { username: row.username, displayName: row.displayName ?? '', password: '', roleId: row.roleId ?? '' };
}
async function save(): Promise<void> {
  if (dlg.isCreate) {
    if (!dlg.form.username || !dlg.form.password) { ElMessage.warning('用户名与密码必填'); return; }
    await http.post('/users', dlg.form);
  } else {
    await http.put(`/users/${dlg.id}`, { displayName: dlg.form.displayName, roleId: dlg.form.roleId });
  }
  dlg.visible = false; ElMessage.success('已保存'); load();
}
async function resetPwd(row: UserRow): Promise<void> {
  const r = await ElMessageBox.prompt('新密码', `重置 ${row.username} 的密码`, { inputType: 'password' }).catch(() => null);
  if (!r?.value) return;
  await http.put(`/users/${row.id}/password`, { password: r.value });
  ElMessage.success('已重置');
}
async function toggle(row: UserRow): Promise<void> {
  await http.put(`/users/${row.id}`, { enabled: !row.enabled });
  load();
}
onMounted(load);
</script>

<style scoped>.bar { display: flex; justify-content: space-between; align-items: center; }</style>
