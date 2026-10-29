FROM node:20-alpine AS build
RUN npm install -g pnpm@8
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
RUN pnpm install --filter @cps/admin-web... && pnpm --filter @cps/admin-web run build

FROM nginx:alpine
COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 80
