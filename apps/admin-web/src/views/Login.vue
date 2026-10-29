<template>
  <div class="login-bg">
    <el-card class="login-card">
      <h2 class="title">内容集中发布系统</h2>
      <p class="subtitle">管理后台</p>
      <el-form :model="form" @keyup.enter="submit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" :disabled="loading">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            :disabled="loading"
          >
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">
          登 录
        </el-button>
      </el-form>
      <p class="tip">初始账号 admin / admin123（首次部署后请修改）</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function submit(): Promise<void> {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    router.push('/');
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    ElMessage.error(err.response?.data?.message || '登录失败，请检查用户名密码');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-bg {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a2330 0%, #2c3e50 100%);
}
.login-card {
  width: 380px;
  padding: 12px 8px;
}
.title {
  margin: 8px 0 4px;
  text-align: center;
  color: #1a2330;
}
.subtitle {
  margin: 0 0 20px;
  text-align: center;
  color: #909399;
}
.tip {
  margin-top: 16px;
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
}
</style>
