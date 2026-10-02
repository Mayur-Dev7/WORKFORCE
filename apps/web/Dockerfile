# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY tsconfig.base.json ./

# Build arguments for frontend configuration
ARG VITE_AUTH_PROVIDER=legacy
ARG VITE_FIREBASE_API_KEY=AIzaSyCqNWpfBZlZuwsdhzLvd7dPcSCV3ZfG-fw
ARG VITE_FIREBASE_AUTH_DOMAIN=workforce-b553b.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=workforce-b553b
ARG VITE_FIREBASE_APP_ID=1:844442367846:web:485e2e3f601733c4bdfaa7

ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

# Build shared, then web (production — no basicSsl plugin active in build)
# VITE_API_URL is intentionally NOT set so it falls back to '/api/v1' (same origin)
RUN npm run --workspace=packages/shared build \
 && npm run --workspace=apps/web build


# ── Stage 2: nginx runtime ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy production nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built frontend assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
