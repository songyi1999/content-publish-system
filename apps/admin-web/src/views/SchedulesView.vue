<template>
  <el-card>
    <template #header>
      <div class="bar"><span>排期管理（R12 分时段/周期/优先级）</span><el-button type="primary" @click="open()">新建排期</el-button></div>
    </template>
    <el-table :data="items" border>
      <el-table-column prop="name" label="排期名" width="160" />
      <el-table-column label="节目" width="150">
        <template #default="{ row }">{{ row.program?.name ?? row.programId }}</template>
      </el-table-column>
      <el-table-column label="优先级" width="90">
        <template #default="{ row }"><el-tag :type="row.priority >= 100 ? 'danger' : row.priority >= 5 ? 'warning' : 'info'" size="small">{{ row.priority }}</el-tag></template>
      </el-table-column>
      <el-table-column label="时段" width="150">
        <template #default="{ row }">{{ fmtMin(row.startMinute) }} ~ {{ fmtMin(row.endMinute) }}</template>
      </el-table-column>
      <el-table-column label="星期" min-width="160">
        <template #default="{ row }">
          <el-tag v-for="d in row.daysOfWeek" :key="d" size="small" style="margin: 1px">{{ DAYS[d] }}</el-tag>
          <span v-if="!row.daysOfWeek?.length" style="color: #909399; font-size: 12px">每天</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="open(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.id ? '编辑排期' : '新建排期'" width="560">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="节目">
          <el-select v-model="dlg.form.programId" style="width: 100%">
            <el-option v-for="p in programs" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-slider v-model="dlg.form.priority" :min="1" :max="100" show-input />
          <span class="tip">紧急插播请设为 100（最高，即时打断当前节目）</span>
        </el-form-item>
        <el-form-item label="生效日">
          <el-checkbox-group v-model="dlg.form.daysOfWeek">
            <el-checkbox v-for="(v, k) in DAYS" :key="Number(k)" :value="Number(k)">{{ v }}</el-checkbox>
          </el-checkbox-group>
          <span class="tip">不选 = 每天</span>
        </el-form-item>
        <el-form-item label="每日时段">
          <el-time-picker v-model="dlg.form.start" format="HH:mm" /> ~
          <el-time-picker v-model="dlg.form.end" format="HH:mm" />
          <span class="tip">结束小于开始表示跨午夜</span>
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

const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
interface Row { id: string; name: string; programId: string; program?: { name: string } | null; priority: number; daysOfWeek: number[]; startMinute: number; endMinute: number }
const items = ref<Row[]>([]);
const programs = ref<Array<{ id: string; name: string }>>([]);
const dlg = reactive({
  visible: false, id: '',
  form: { name: '', programId: '', priority: 1, daysOfWeek: [] as number[], start: new Date(2000, 0, 1, 0, 0), end: new Date(2000, 0, 1, 23, 59) },
});

async function load(): Promise<void> { items.value = (await http.get('/schedules')) as unknown as Row[]; }
function open(row?: Row): void {
  dlg.id = row?.id ?? '';
  dlg.form = {
    name: row?.name ?? '',
    programId: row?.programId ?? programs.value[0]?.id ?? '',
    priority: row?.priority ?? 1,
    daysOfWeek: row ? [...row.daysOfWeek] : [],
    start: new Date(2000, 0, 1, Math.floor((row?.startMinute ?? 0) / 60), (row?.startMinute ?? 0) % 60),
    end: new Date(2000, 0, 1, Math.floor((row?.endMinute ?? 1439) / 60), (row?.endMinute ?? 1439) % 60),
  };
  dlg.visible = true;
}
async function save(): Promise<void> {
  const toMin = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const payload = {
    name: dlg.form.name,
    programId: dlg.form.programId,
    priority: dlg.form.priority,
    daysOfWeek: dlg.form.daysOfWeek,
    startMinute: toMin(dlg.form.start),
    endMinute: toMin(dlg.form.end),
  };
  if (dlg.id) await http.put(`/schedules/${dlg.id}`, payload);
  else await http.post('/schedules', payload);
  dlg.visible = false; ElMessage.success('已保存（在线终端 60 秒内生效）'); load();
}
async function remove(row: Row): Promise<void> {
  await ElMessageBox.confirm(`确认删除排期「${row.name}」？`, '提示');
  await http.delete(`/schedules/${row.id}`);
  load();
}
function fmtMin(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
onMounted(async () => {
  load();
  programs.value = (await http.get('/programs')) as unknown as typeof programs.value;
});
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; }
.tip { font-size: 12px; color: #909399; margin-left: 8px; }
</style>
