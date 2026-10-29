# 服务端镜像：含 ffmpeg（M3 转码在容器内完成）
FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && npm install -g pnpm@8

WORKDIR /app
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --filter @cps/server... \
  && pnpm --filter @cps/server exec prisma generate \
  && pnpm --filter @cps/server run build

ENV NODE_ENV=production
EXPOSE 3000
# 启动前先执行数据库迁移（幂等）
CMD ["sh", "-c", "pnpm --filter @cps/server exec prisma migrate deploy && node apps/server/dist/main.js"]
