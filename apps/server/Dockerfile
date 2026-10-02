# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Build tools for native modules (bcrypt). Builder stage only.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install deps WITH scripts so bcrypt builds its native binary
RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/
COPY tsconfig.base.json ./

RUN npm run --workspace=packages/shared build \
 && npm run --workspace=apps/server build

# Drop devDependencies but keep the compiled bcrypt binary
RUN npm prune --omit=dev

# ── Stage 2: production runtime ─────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Reuse the already-built production node_modules from the builder
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/server/db ./apps/server/db

# Fail the build (not the deploy) if bcrypt is broken
RUN node -e "require('bcrypt'); console.log('bcrypt ok')"

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000
CMD ["node", "apps/server/dist/server.js"]
