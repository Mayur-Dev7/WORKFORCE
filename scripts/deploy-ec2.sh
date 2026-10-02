#!/usr/bin/env bash
# deploy-ec2.sh — runs on EC2 via AWS SSM
# Called by GitHub Actions with env vars: BACKEND_IMAGE, FRONTEND_IMAGE, IMAGE_TAG

set -euo pipefail

APP_DIR="/home/ubuntu/apps/WORKFORCE"
COMPOSE_FILE="${APP_DIR}/docker/docker-compose.prod.yml"
ENV_FILE="${APP_DIR}/apps/server/.env"
DEPLOY_ENV="${APP_DIR}/.env.deploy"
AWS_REGION="ap-south-1"
HEALTH_URL="https://workforce.duckdns.org"
BACKEND_HEALTH_URL="http://localhost:4000/health"  # checked via docker exec

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ── 0. Validate required env vars ────────────────────────────────────────────
: "${BACKEND_IMAGE:?BACKEND_IMAGE must be set}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set}"

log "🚀 Starting deployment of tag: ${IMAGE_TAG}"
log "   Backend:  ${BACKEND_IMAGE}:${IMAGE_TAG}"
log "   Frontend: ${FRONTEND_IMAGE}:${IMAGE_TAG}"

# ── 1. Save previous tag for rollback ────────────────────────────────────────
PREVIOUS_TAG=""
if [ -f "${DEPLOY_ENV}" ]; then
    PREVIOUS_TAG=$(grep '^IMAGE_TAG=' "${DEPLOY_ENV}" | cut -d= -f2 || true)
    log "   Previous tag: ${PREVIOUS_TAG:-<none>}"
fi

# ── 2. Update repository ─────────────────────────────────────────────────────
log "📦 Updating repository..."
cd "${APP_DIR}"
git fetch origin main
git reset --hard origin/main

# ── 3. Write deployment env file ─────────────────────────────────────────────
log "📝 Writing .env.deploy..."
cat > "${DEPLOY_ENV}" << EOF
BACKEND_IMAGE=${BACKEND_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
IMAGE_TAG=${IMAGE_TAG}
PREVIOUS_TAG=${PREVIOUS_TAG}
DEPLOY_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF

# ── 4. Login to ECR ──────────────────────────────────────────────────────────
log "🔐 Logging in to ECR..."
ECR_REGISTRY=$(echo "${BACKEND_IMAGE}" | cut -d/ -f1)
aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── 5. Pull new images ────────────────────────────────────────────────────────
log "⬇️  Pulling new images from ECR..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --env-file "${DEPLOY_ENV}" pull backend frontend

# ── 6. Run database migrations ───────────────────────────────────────────────
log "🗃️  Running database migrations..."
docker run --rm \
    --network workforce_access_network \
    --env-file "${ENV_FILE}" \
    -e DB_HOST=postgres \
    -e DB_PORT=5432 \
    "${BACKEND_IMAGE}:${IMAGE_TAG}" \
    sh -c "cd /app && node_modules/.bin/node-pg-migrate up --migrations-dir apps/server/db/migrations --database-url-env DATABASE_URL"

# ── 7. Recreate containers ────────────────────────────────────────────────────
log "🔄 Restarting application containers..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --env-file "${DEPLOY_ENV}" up -d --remove-orphans

# ── 8. Wait for containers to be healthy ─────────────────────────────────────
log "⏳ Waiting for containers to stabilise..."
sleep 10

# ── 9. Verify container status ───────────────────────────────────────────────
log "🔍 Checking container status..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --env-file "${DEPLOY_ENV}" ps

# Check postgres is healthy
PG_STATUS=$(docker inspect --format='{{.State.Health.Status}}' workforce_access_postgres 2>/dev/null || echo "unknown")
if [ "${PG_STATUS}" != "healthy" ]; then
    log "❌ PostgreSQL is not healthy (status: ${PG_STATUS})"
    exit 1
fi

# Check backend is running
BE_STATUS=$(docker inspect --format='{{.State.Status}}' workforce_access_backend 2>/dev/null || echo "unknown")
if [ "${BE_STATUS}" != "running" ]; then
    log "❌ Backend container is not running (status: ${BE_STATUS})"
    docker logs --tail=50 workforce_access_backend 2>&1 || true
    exit 1
fi

# Check frontend is running
FE_STATUS=$(docker inspect --format='{{.State.Status}}' workforce_access_frontend 2>/dev/null || echo "unknown")
if [ "${FE_STATUS}" != "running" ]; then
    log "❌ Frontend container is not running (status: ${FE_STATUS})"
    docker logs --tail=50 workforce_access_frontend 2>&1 || true
    exit 1
fi

# ── 10. HTTP health check ─────────────────────────────────────────────────────
log "🌐 Running HTTP health check..."
for attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 15 "${HEALTH_URL}" -o /dev/null; then
        log "✅ Health check passed (attempt ${attempt})"
        break
    fi
    if [ "${attempt}" -eq 5 ]; then
        log "❌ Health check failed after 5 attempts"
        exit 1
    fi
    log "   Health check attempt ${attempt} failed, retrying in 10s..."
    sleep 10
done

# ── 11. Clean up old images (keep last 3) ────────────────────────────────────
log "🧹 Cleaning up dangling images..."
docker image prune -f || true

log "✅ Deployment of ${IMAGE_TAG} complete!"
log "   Application is live at: ${HEALTH_URL}"
