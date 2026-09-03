FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SNAIL_NOTE_DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist \
    HOST=0.0.0.0 \
    PORT=61666
COPY --from=build /app /app
RUN mkdir -p /notes /data
EXPOSE 61666
VOLUME ["/notes", "/data"]
CMD ["node", "apps/server/dist/main.js"]
