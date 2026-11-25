FROM node:22.17.1-bookworm
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY backend/ ./
COPY ops/initialize.cjs ./initialize.cjs
RUN pnpm build && mkdir -p uploads
CMD ["node", "dist/src/main.js"]
