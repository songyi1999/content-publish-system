<template>
  <el-card>
    <template #header><span>系统设置（SY-01/02/03）</span></template>

    <el-form label-width="150px" style="max-width: 640px">
      <el-form-item label="AI 审核（图片/视频）">
        <el-switch v-model="params.aiReviewEnabled" />
        <span class="tip">走多模态大模型网关（服务端 env 配置）</span>
      </el-form-item>
      <el-form-item label="告警通知">
        <el-switch v-model="params.alertEnabled" />
        <el-button size="small" style="margin-left: 12px" @click="testAlert">发送测试告警</el-button>
      </el-form-item>
      <el-form-item label="下载限速（MB/s）">
        <el-input-number v-model="params.downloadRateMbps" :min="1" :max="100" />
      </el-form-item>
      <el-divider>下载与终端（PB-10/DV-07/PD-06）</el-divider>
      <el-form-item label="错峰下载窗口">
        <el-input v-model="params.downloadWindow" placeholder="如 00:00-06:00，留空=全天可下载" style="width: 220px" />
      </el-form-item>
      <el-form-item label="存储水位告警">
        <el-input-number v-model="params.storageAlertFreeMB" :min="100" :max="102400" />
        <span class="tip">剩余低于该 MB 数时 webhook 告警</span>
      </el-form-item>
      <el-form-item label="排期交叠策略">
        <el-select v-model="params.scheduleOverlap" style="width: 220px">
          <el-option label="允许交叠（按优先级覆盖）" value="allow" />
          <el-option label="禁止交叠（保存时校验）" value="forbid" />
        </el-select>
      </el-form-item>
      <el-divider>账号安全（UM-01）与备份（SY-02）</el-divider>
      <el-form-item label="密码最小长度">
        <el-input-number v-model="params.passwordMinLength" :min="6" :max="32" />
      </el-form-item>
      <el-form-item label="自动备份">
        <el-switch v-model="params.backupAutoEnabled" />
        <span class="tip">开启后每小时快照归档，保留 7 天</span>
      </el-form-item>
      <el-divider>审核规则（AV-07）</el-divider>
      <el-form-item label="可疑处置策略">
        <el-select v-model="params.reviewSuspectPolicy" style="width: 220px">
          <el-option label="驳回（严格）" value="reject" />
          <el-option label="送人工复审" value="manual" />
          <el-option label="直接通过（宽松）" value="pass" />
        </el-select>
        <span class="tip">违规命中始终自动驳回，不受此策略影响</span>
      </el-form-item>
      <el-form-item label="视频抽帧数">
        <el-input-number v-model="params.reviewVideoFrames" :min="1" :max="6" />
        <span class="tip">视频送审时均匀抽取的帧数</span>
      </el-form-item>
      <el-divider>客户端版本与灰度（TC-09/TC-11）</el-divider>
      <el-form-item label="最新版本（灰度）">
        <el-input v-model="params.latestVersion" placeholder="如 0.2.0" style="width: 160px" />
      </el-form-item>
      <el-form-item label="稳定版本">
        <el-input v-model="params.stableVersion" placeholder="如 0.1.0" style="width: 160px" />
      </el-form-item>
      <el-form-item label="灰度分组">
        <el-select v-model="params.grayGroupIds" multiple style="width: 100%" placeholder="选中分组拿最新版，其余拿稳定版">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="save">保存参数</el-button>
      </el-form-item>
    </el-form>

    <el-divider>数据库备份（SY-02）</el-divider>
    <div class="backup-bar">
      <el-button type="primary" :loading="backing" @click="backup">立即备份</el-button>
      <span class="tip">生成于服务端 data/backups（需宿主机 pg_dump），完成后 webhook 通知</span>
    </div>
    <el-table :data="backups" border size="small" style="margin-top: 10px; max-width: 640px">
      <el-table-column prop="name" label="备份文件" min-width="260" />
      <el-table-column label="大小" width="120">
        <template #default="{ row }">{{ (row.sizeBytes / 1024 / 1024).toFixed(2) }} MB</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '../api/http';

const groups = ref<Array<{ id: string; name: string }>>([]);
const backups = ref<Array<{ name: string; sizeBytes: number }>>([]);
const backing = ref(false);
const params = reactive({
  aiReviewEnabled: true,
  alertEnabled: true,
  downloadRateMbps: 8,
  latestVersion: '',
  stableVersion: '',
  grayGroupIds: [] as string[],
  reviewSuspectPolicy: 'reject',
  reviewVideoFrames: 3,
  downloadWindow: '',
  storageAlertFreeMB: 1024,
  scheduleOverlap: 'allow',
  passwordMinLength: 8,
  backupAutoEnabled: false,
});

async function load(): Promise<void> {
  const p = (await http.get('/system/params')) as unknown as Record<string, unknown>;
  params.aiReviewEnabled = (p.aiReviewEnabled as boolean) ?? true;
  params.alertEnabled = (p.alertEnabled as boolean) ?? true;
  params.downloadRateMbps = (p.downloadRateMbps as number) ?? 8;
  params.latestVersion = (p.latestVersion as string) ?? '';
  params.stableVersion = (p.stableVersion as string) ?? '';
  params.grayGroupIds = (p.grayGroupIds as string[]) ?? [];
  const rv = (p.review ?? {}) as { suspectPolicy?: string; videoFrames?: number };
  params.reviewSuspectPolicy = rv.suspectPolicy ?? 'reject';
  params.reviewVideoFrames = rv.videoFrames ?? 3;
  const dw = (p.downloadWindow ?? {}) as { window?: string };
  params.downloadWindow = dw.window ?? '';
  const wm = (p.storageAlertFreeMB ?? {}) as { mb?: number };
  params.storageAlertFreeMB = wm.mb ?? 1024;
  const so = (p.scheduleOverlap ?? {}) as { mode?: string };
  params.scheduleOverlap = so.mode ?? 'allow';
  const pw = (p.passwordPolicy ?? {}) as { minLength?: number };
  params.passwordMinLength = pw.minLength ?? 8;
  const ba = (p.backupAutoEnabled ?? {}) as { enabled?: boolean };
  params.backupAutoEnabled = ba.enabled ?? false;
  backups.value = (await http.get('/system/backups')) as unknown as typeof backups.value;
  groups.value = (await http.get('/device-groups')) as unknown as typeof groups.value;
}
async function save(): Promise<void> {
  const { reviewSuspectPolicy, reviewVideoFrames, downloadWindow, storageAlertFreeMB, scheduleOverlap, passwordMinLength, backupAutoEnabled, ...rest } = params;
  await http.put('/system/params', {
    ...rest,
    review: { suspectPolicy: reviewSuspectPolicy, videoFrames: reviewVideoFrames },
    downloadWindow: { window: downloadWindow || undefined },
    storageAlertFreeMB: { mb: storageAlertFreeMB },
    scheduleOverlap: { mode: scheduleOverlap },
    passwordPolicy: { minLength: passwordMinLength },
    backupAutoEnabled: { enabled: backupAutoEnabled },
  });
  ElMessage.success('参数已保存');
}
async function testAlert(): Promise<void> {
  const r = (await http.post('/system/alert-test')) as unknown as { enabled: boolean };
  r.enabled ? ElMessage.success('测试告警已发送，请查收 webhook') : ElMessage.warning('服务端未配置 ALERT_WEBHOOK_URL');
}
async function backup(): Promise<void> {
  backing.value = true;
  try {
    const r = (await http.post('/system/backup')) as unknown as { file: string };
    ElMessage.success(`备份完成：${r.file}`);
    load();
  } finally {
    backing.value = false;
  }
}
onMounted(load);
</script>

<style scoped>
.tip { font-size: 12px; color: #909399; margin-left: 8px; }
.backup-bar { display: flex; align-items: center; }
</style>
