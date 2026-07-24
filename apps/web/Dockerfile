# syntax=docker/dockerfile:1.6
# Build multi-stage del web Next.js para DO App Platform.
# Bypasseamos el buildpack (que prunea devDeps y rompe el build de TS) para tener
# control total sobre el orden de builds (shared, db, luego web).

# ─── Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace + lockfile + tsconfig base (los packages lo extienden con ../../).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./

# Manifests de los workspaces (para que pnpm resuelva el grafo).
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Código fuente (orden importa para cache).
COPY packages/ packages/
COPY apps/web/ apps/web/

# Next.js bakea las NEXT_PUBLIC_* dentro del bundle en build time. Las recibimos
# como ARGs y las exportamos como ENV antes de `next build`. Las que NO empiezan
# con NEXT_PUBLIC_ se leen en runtime con process.env normal.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_WEB_PORT
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN
ENV NEXT_PUBLIC_WEB_PORT=$NEXT_PUBLIC_WEB_PORT

# Generar Prisma client + compilar shared/db + buildear Next.
# El orden importa: shared y db compilados antes de que el web los importe.
RUN pnpm --filter @soytuturno/db generate \
 && pnpm --filter @soytuturno/shared build \
 && pnpm --filter @soytuturno/db build \
 && pnpm --filter @soytuturno/web build

# ─── Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web

# El web arranca con `next start -p 3200`.
EXPOSE 3200
CMD ["pnpm", "--filter", "@soytuturno/web", "start"]
