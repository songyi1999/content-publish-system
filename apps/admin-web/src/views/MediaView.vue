<template>
  <el-card>
    <template #header>
      <div class="bar">
        <span>素材库</span>
        <div>
          <el-input v-model="keyword" placeholder="搜索文件名" style="width: 180px; margin-right: 8px" clearable @change="load" />
          <el-radio-group v-model="kind" style="margin-right: 8px" @change="load">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="image">图片</el-radio-button>
            <el-radio-button value="video">视频</el-radio-button>
          </el-radio-group>
          <el-upload :show-file-list="false" :http-request="doUpload" multiple>
            <el-button type="primary">上传素材</el-button>
          </el-upload>
        </div>
      </div>
    </template>
    <el-row :gutter="12">
      <el-col v-for="m in items" :key="m.id" :span="4" style="margin-bottom: 12px">
        <el-card shadow="hover" body-style="padding: 8px">
          <div class="thumb">
            <img v-if="m.kind === 'image'" :src="m.url" />
            <video v-else-if="m.kind === 'video'" :src="m.url" muted />
            <span v-else class="doc">{{ m.kind }}</span>
          </div>
          <div class="name" :title="m.originalName ?? ''">{{ m.originalName }}</div>
          <div class="size">{{ (m.sizeBytes / 1024).toFixed(0) }} KB</div>
          <div class="ops">
            <el-button v-if="m.kind === 'video'" size="small" @click="transcode(m.id)">转码</el-button>
            <el-button size="small" type="danger" @click="remove(m.id)">删除</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-pagination layout="prev, pager, next, total" :total="total" :page-size="24" :current-page="page" @current-change="(p: number) => { page = p; load(); }" />
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '../api/http';

interface MediaRow { id: string; kind: string; url: string; originalName: string | null; sizeBytes: number }
const items = ref<MediaRow[]>([]);
const total = ref(0);
const page = ref(1);
const kind = ref('');
const keyword = ref('');

async function load(): Promise<void> {
  const r = (await http.get(`/media?page=${page.value}&pageSize=24&kind=${kind.value}&keyword=${keyword.value}`)) as unknown as { total: number; items: MediaRow[] };
  total.value = r.total; items.value = r.items;
}
function doUpload(o: unknown): void { void upload(o as { file: File }); }

async function upload(opt: { file: File }): Promise<void> {
  const fd = new FormData();
  fd.append('file', opt.file);
  const r = (await http.post('/media/upload', fd)) as unknown as { duplicated?: boolean };
  ElMessage.success(r.duplicated ? '素材已存在（sha256 去重）' : '上传成功');
  load();
}
async function transcode(id: string): Promise<void> {
  ElMessage.info('转码已提交（大文件耗时较长）');
  await http.post(`/media/${id}/transcode`);
  ElMessage.success('转码完成'); load();
}
async function remove(id: string): Promise<void> {
  await ElMessageBox.confirm('确认删除该素材？', '提示');
  const r = (await http.delete(`/media/${id}`)) as unknown as { ok: boolean; message?: string };
  if (!r.ok) ElMessage.warning(r.message ?? '无法删除');
  else ElMessage.success('已删除');
  load();
}
onMounted(load);
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; }
.thumb { height: 110px; display: flex; align-items: center; justify-content: center; background: #f5f7fa; }
.thumb img, .thumb video { max-width: 100%; max-height: 110px; }
.doc { color: #909399; }
.name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.size { font-size: 12px; color: #909399; }
.ops { margin-top: 4px; display: flex; gap: 4px; }
</style>
