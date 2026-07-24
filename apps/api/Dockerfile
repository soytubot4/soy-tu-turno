# syntax=docker/dockerfile:1.6
# Build multi-stage del API NestJS para DO App Platform.
# Bypasseamos el buildpack de DO (que prunea devDeps y rompe el build de TS)
# usando una imagen Docker con control total sobre install + build + runtime.

# ─── Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Habilitamos corepack y fijamos la versión de pnpm que usamos en el lockfile.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace + lockfile + tsconfig base (los packages lo extienden con ../../).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./

# Manifests de cada workspace (necesarios para que pnpm resuelva el grafo).
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

# Instalamos TODAS las deps (dev incluidas — TS, types, nest CLI). NO seteamos
# NODE_ENV=production acá: queremos prisma + nest binaries disponibles.
RUN pnpm install --frozen-lockfile

# Ahora sí copiamos el código fuente y generamos + compilamos.
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm --filter @soytuturno/db generate \
 && pnpm --filter @soytuturno/shared build \
 && pnpm --filter @soytuturno/db build \
 && pnpm --filter @soytuturno/api build

# ─── Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

ENV NODE_ENV=production
# DO App Platform rutea al puerto 8080. La API lee API_PORT.
ENV API_PORT=8080

# Copiamos node_modules + sources + dist del builder. packages/ se consume
# compilado, así que copiamos la carpeta entera.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
