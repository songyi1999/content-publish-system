<template>
  <div>
    <el-row :gutter="12" style="margin-bottom: 12px">
      <el-col :span="6"><el-card shadow="never"><el-statistic title="终端总数" :value="dash.total" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="在线" :value="dash.online" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="离线" :value="dash.offline" /></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><el-statistic title="在线率（R3）" :value="dash.onlineRate" suffix="%" /></el-card></el-col>
    </el-row>

    <el-card>
      <template #header>
        <div class="bar"><span>设备管理</span>
          <div>
            <el-select v-model="newGroup" placeholder="所属分组" clearable style="width: 140px; margin-right: 8px">
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
            </el-select>
            <el-button type="primary" @click="createDevice">新建设备（激活码）</el-button>
            <el-button @click="createGroup">新建分组</el-button>
          </div>
        </div>
      </template>
      <el-table :data="items" border>
        <el-table-column prop="code" label="设备号" width="150" />
        <el-table-column prop="name" label="名称" width="130" />
        <el-table-column label="在线（R3）" width="100">
          <template #default="{ row }">
            <el-tag :type="row.online ? 'success' : 'danger'" size="small">{{ row.online ? '在线' : '离线' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column prop="appVersion" label="版本" width="90" />
        <el-table-column label="型号" width="110">
          <template #default="{ row }">{{ row.model ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="剩余存储" width="100">
          <template #default="{ row }">{{ row.storageFreeBytes != null ? (row.storageFreeBytes / 1024 / 1024 / 1024).toFixed(1) + 'G' : '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag v-if="!row.enabled" size="small" type="danger">已禁用</el-tag>
            <el-tag v-else size="small" type="info">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastSeenAt" label="最后心跳" width="165">
          <template #default="{ row }">{{ row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString('zh-CN', { hour12: false }) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="380">
          <template #default="{ row }">
            <el-button size="small" @click="powerPlan(row)">定时开关机</el-button>
            <el-button size="small" @click="cmd(row, 'reboot')">重启</el-button>
            <el-button size="small" @click="cmd(row, 'screenshot')">截屏</el-button>
            <el-button size="small" :type="row.enabled ? 'warning' : 'success'" @click="toggleEnabled(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button>
            <el-button size="small" type="danger" plain @click="unbind(row)">解绑</el-button>
            <el-button size="small" type="danger" @click="wipe(row)">擦除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

interface DeviceRow { id: string; code: string; name: string | null; online: boolean; ip: string | null; appVersion: string | null; lastSeenAt: string | null; model?: string | null; storageFreeBytes?: number | null; enabled?: boolean }
const items = ref<DeviceRow[]>([]);
const groups = ref<Array<{ id: string; name: string }>>([]);
const dash = ref({ total: 0, online: 0, offline: 0, onlineRate: 0 });
const newGroup = ref('');
let timer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  items.value = (await http.get('/devices')) as unknown as DeviceRow[];
  dash.value = (await http.get('/devices/dashboard')) as unknown as typeof dash.value;
}
async function createDevice(): Promise<void> {
  const r = (await http.post('/devices', { groupId: newGroup.value || undefined })) as unknown as { code: string; activateCode: string };
  ElMessageBox.alert(`设备号：${r.code}　激活码：${r.activateCode}`, '创建成功，终端输入激活码完成注册');
  load();
}
async function createGroup(): Promise<void> {
  const r = await ElMessageBox.prompt('分组名称', '新建分组').catch(() => null);
  if (!r?.value) return;
  await http.post('/device-groups', { name: r.value });
  ElMessage.success('已创建'); loadGroups();
}
async function loadGroups(): Promise<void> {
  groups.value = (await http.get('/device-groups')) as unknown as typeof groups.value;
}
/** 禁用/启用（DV-04）：禁用后终端清单接口失效 */
async function toggleEnabled(row: DeviceRow): Promise<void> {
  await ElMessageBox.confirm(`确认${row.enabled ? '禁用' : '启用'}终端 ${row.name ?? row.code}？`, '提示');
  await http.put(`/devices/${row.id}`, { enabled: !row.enabled });
  ElMessage.success('已更新'); load();
}
/** 解绑（DV-04）：清除密钥重发激活码 */
async function unbind(row: DeviceRow): Promise<void> {
  await ElMessageBox.confirm(`解绑后 ${row.name ?? row.code} 需重新输入激活码才能使用，确认？`, '解绑终端');
  const r = (await http.post(`/devices/${row.id}/unbind`)) as unknown as { activateCode: string };
  ElMessageBox.alert(`新激活码：${r.activateCode}`, '已解绑');
  load();
}
/** 远程擦除（DV-04）：终端清空本地缓存并回到激活页 */
async function wipe(row: DeviceRow): Promise<void> {
  await ElMessageBox.confirm(`将指令 ${row.name ?? row.code} 清空本地内容与配置，确认？`, '远程擦除');
  const r = (await http.post(`/devices/${row.id}/wipe`)) as unknown as { ok: boolean; message?: string };
  r.ok ? ElMessage.success('擦除指令已下发') : ElMessage.warning(r.message ?? '终端离线');
}
async function cmd(row: DeviceRow, type: string): Promise<void> {
  await ElMessageBox.confirm(`向 ${row.name ?? row.code} 下发「${type}」指令？`, '确认');
  const r = (await http.post(`/devices/${row.id}/command`, { type })) as unknown as { ok: boolean; message?: string };
  r.ok ? ElMessage.success('已下发') : ElMessage.warning(r.message ?? '终端离线');
}
async function powerPlan(row: DeviceRow): Promise<void> {
  const r = await ElMessageBox.prompt('格式：开/关机分钟，如 480,1260（可留空清除）', '定时开关机（R13）', { inputPlaceholder: '480,1260' }).catch(() => null);
  if (!r) return;
  const v = (r.value ?? '').trim();
  const plan = v ? { onMinute: Number(v.split(',')[0]), offMinute: Number(v.split(',')[1]) } : null;
  await http.put(`/devices/${row.id}`, { powerPlan: plan });
  ElMessage.success('电源策略已保存并下发');
}
onMounted(() => { load(); loadGroups(); timer = setInterval(load, 30_000); });
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>.bar { display: flex; justify-content: space-between; }</style>
