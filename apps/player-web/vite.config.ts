import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base './' 必须保留：Capacitor 与 Electron 均以 file:// 加载产物
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { port: 5174 },
  build: {
    // 工作区 CJS 包（@cps/player-core）需要 rollup 做 CommonJS 互操作
    commonjsOptions: { include: [/player-core/, /shared/, /node_modules/] },
  },
});
