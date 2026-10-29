import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cps.player',
  appName: '内容发布终端',
  // webDir 指向 monorepo 内的播放器产物（先 pnpm build:web 再 cap sync）
  webDir: '../player-web/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
