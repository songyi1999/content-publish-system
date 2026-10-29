# 服务端镜像：静态 ffmpeg（多阶段复制，避免 apt 网络瓶颈；M3 转码在容器内完成）
FROM node:20-bookworm-slim
COPY --from=mwader/static-ffmpeg:7.1 /ffmpeg /usr/local/bin/ffmpeg
COPY --from=mwader/static-ffmpeg:7.1 /ffprobe /usr/local/bin/ffprobe
RUN npm install -g pnpm@8

WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --filter @cps/server...   && pnpm --filter @cps/server exec prisma generate   && pnpm --filter @cps/server run build

ENV NODE_ENV=production
EXPOSE 3000
# 启动前先执行数据库迁移（幂等）
CMD ["sh", "-c", "pnpm --filter @cps/server exec prisma migrate deploy && node apps/server/dist/main.js"]
