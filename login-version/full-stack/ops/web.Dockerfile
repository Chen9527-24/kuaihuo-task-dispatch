FROM node:22.17.1-bookworm AS build
ARG APP
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY ${APP}/package.json ${APP}/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ${APP}/ ./
ARG VITE_DISPATCH_BASE_URL
ARG VITE_APP_ENV=production
ENV VITE_API_BASE_URL=/api/v1 VITE_APP_ENV=${VITE_APP_ENV}
RUN pnpm build

FROM nginx:stable-alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY ops/site.conf /etc/nginx/conf.d/default.conf
