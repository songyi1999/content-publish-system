# 服务端镜像：Alpine + apk ffmpeg（M3 转码在容器内完成）
# libssl1.1/libcrypto1.1 来自 alpine v3.16 仓库，供 Prisma musl 引擎(musl-openssl-1.1)加载
FROM node:20-alpine
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.16/main" >> /etc/apk/repositories \
  && apk add --no-cache ffmpeg openssl libssl1.1 libcrypto1.1 \
  && npm install -g pnpm@8

WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --filter @cps/server... \
  && pnpm --filter @cps/server exec prisma generate \
  && pnpm --filter @cps/server run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node apps/server/scripts/run-migrations.mjs && node apps/server/dist/main.js"]
