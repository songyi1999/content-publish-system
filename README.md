# 内容集中发布系统（content-publish-system）

集中管理 · 统一审核 · 定向下发 · 离线展示。全栈 TypeScript monorepo：NestJS 服务端 + Vue3 管理后台 + Capacitor Android（APK）/ Electron Windows（EXE）双端终端。

## 仓库结构

| 目录 | 说明 |
|---|---|
| `apps/server` | 服务端（NestJS + Prisma + PostgreSQL + socket.io 设备网关） |
| `apps/admin-web` | 管理后台（Vue3 + Element Plus + wangEditor） |
| `apps/player-web` | 终端播放器 UI（产物供 APK/EXE 加载） |
| `apps/client-android` | Android 壳（Capacitor） |
| `apps/client-windows` | Windows 壳（Electron kiosk） |
| `packages/shared` | 协议常量 / 状态机 / DTO（多端共用） |
| `packages/player-core` | 节目单调度引擎 / 播放定位 / 离线内容库接口（纯 TS） |
| `docs` | 开发计划、架构说明、CI 说明、部署手册 |

## 快速开始（本机开发）

前置：Node ≥ 18.18（建议 20）、pnpm 8、Docker Desktop。

```bash
pnpm install               # 安装全部依赖
pnpm dev:infra             # 启动 PostgreSQL + Redis（docker）
cp .env.example .env       # 环境变量（开发默认即可）

# 服务端：首次初始化数据库并写入种子账号 admin/admin123
pnpm --filter @cps/server exec prisma migrate dev
pnpm db:seed

pnpm dev:server            # 服务端 http://localhost:3000
pnpm dev:web               # 管理后台 http://localhost:5173（账号 admin/admin123）
pnpm dev:player            # 播放器预览 http://localhost:5174
```

## 一键容器化部署（生产/演示）

```bash
cp .env.example .env       # 务必修改 JWT_SECRET 与数据库密码
docker compose up -d --build
# 管理后台 http://<主机>:8080，媒体目录挂载于 ./data/media
```

## 客户端打包

- **Android APK（GitHub Actions）**：推送 tag `android-v0.1.0` 或在 Actions 页手动触发 `Android APK` 工作流，产物在 Artifacts / Releases。签名配置见 `docs/CI说明.md`。
- **Windows EXE**：推送 tag `win-v0.1.0` 触发，或本机 `pnpm --filter @cps/client-windows run dist`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm build` / `pnpm typecheck` / `pnpm test` | 全仓构建 / 类型检查 / 单测 |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | 数据库迁移 / 种子 / 可视化 |
| `pnpm --filter @cps/client-android run sync` | 同步播放器产物到 Android 工程 |

详见 `docs/开发计划.md`（里程碑与 WBS）、`docs/部署手册.md`。
