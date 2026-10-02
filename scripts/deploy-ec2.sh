#!/usr/bin/env bash
# deploy-ec2.sh — runs on EC2 via AWS SSM
# Invoked by GitHub Actions: deploy.yml Job 3
# Required env vars (set by SSM caller): BACKEND_IMAGE  FRONTEND_IMAGE  IMAGE_TAG  COMMIT_SHA

set -euo pipefail

APP_DIR="/home/ubuntu/apps/WORKFORCE"
COMPOSE_FILE="${APP_DIR}/docker/docker-compose.prod.yml"
# Server-side secrets file — NEVER overwritten by this script
ENV_FILE="${APP_DIR}/apps/server/.env"
# Deployment state — image versions only, written each deploy
DEPLOY_ENV="${APP_DIR}/.env.deploy"
AWS_REGION="ap-south-1"
PUBLIC_URL="https://workforce.duckdns.org"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

main() {
# ── 0. Validate required env vars ────────────────────────────────────────────
: "${BACKEND_IMAGE:?BACKEND_IMAGE must be set by the SSM caller}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE must be set by the SSM caller}"
: "${IMAGE_TAG:?IMAGE_TAG must be set by the SSM caller}"
: "${COMMIT_SHA:?COMMIT_SHA must be set by the SSM caller}"

log "🚀 Starting deployment of tag: ${IMAGE_TAG}"
log "   Commit:   ${COMMIT_SHA}"
log "   Backend:  ${BACKEND_IMAGE}:${IMAGE_TAG}"
log "   Frontend: ${FRONTEND_IMAGE}:${IMAGE_TAG}"

# ── 1. Save previous tag for rollback (before anything changes) ───────────────
PREVIOUS_TAG=""
if [ -f "${DEPLOY_ENV}" ]; then
    PREVIOUS_TAG=$(grep '^IMAGE_TAG=' "${DEPLOY_ENV}" 2>/dev/null | cut -d= -f2 || true)
    log "   Previous tag: ${PREVIOUS_TAG:-<none>}"
fi

# ── 2. Update repository to exact commit ──────────────────────────────────────
# Configure non-interactive SSH with the ubuntu user deploy key and ssh config so git never
# hangs waiting for input, regardless of whether SSM runs as root or ubuntu.
export GIT_SSH_COMMAND="ssh -F /home/ubuntu/.ssh/config -i /home/ubuntu/.ssh/github_workforce_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
git config --global --add safe.directory "${APP_DIR}" 2>/dev/null || true

log "📦 Checking out exact commit: ${COMMIT_SHA}..."
cd "${APP_DIR}"
git fetch origin main
git checkout -f "${COMMIT_SHA}"
# Restore execute bit on scripts
chmod +x "${APP_DIR}/scripts/deploy-ec2.sh"
chmod +x "${APP_DIR}/scripts/rollback-ec2.sh"

# ── 3. Write deployment env file (image versions & safe DB URL) ───────────────
# Compute safe, URL-encoded DATABASE_URL targeting the internal Docker service
# "postgres:5432", overriding any localhost:5433 value in apps/server/.env.
BACKEND_DATABASE_URL=$(node -e '
  const fs = require("fs");
  const envPath = process.argv[1];
  if (!fs.existsSync(envPath)) {
    console.error(`FATAL: Environment file not found: ${envPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf8");
  const get = (k) => {
    const m = content.match(new RegExp(`^${k}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  const user = get("DB_USER") || get("POSTGRES_USER") || "workforce_admin";
  const pass = get("DB_PASSWORD") || get("POSTGRES_PASSWORD");
  const name = get("DB_NAME") || get("POSTGRES_DB") || "workforce_access_db";
  if (!pass) {
    console.error(`FATAL: Neither DB_PASSWORD nor POSTGRES_PASSWORD defined in ${envPath}`);
    process.exit(1);
  }
  process.stdout.write(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@postgres:5432/${name}`);
' "${ENV_FILE}")

log "📝 Writing .env.deploy with restricted 0600 permissions..."
(
  umask 077
  cat > "${DEPLOY_ENV}" << EOF
BACKEND_IMAGE=${BACKEND_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
IMAGE_TAG=${IMAGE_TAG}
COMMIT_SHA=${COMMIT_SHA}
PREVIOUS_TAG=${PREVIOUS_TAG}
BACKEND_DATABASE_URL=${BACKEND_DATABASE_URL}
DEPLOY_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
)
chmod 600 "${DEPLOY_ENV}"

# ── 4. Start PostgreSQL first with Docker Compose ────────────────────────────
# Docker Compose creates workforce_access_network automatically.
# Crucial deployment order: PostgreSQL must be running and healthy BEFORE migrations!
log "🐘 Starting PostgreSQL service via Docker Compose..."
docker compose -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    --env-file "${DEPLOY_ENV}" \
    up -d postgres

log "⏳ Waiting for PostgreSQL to become healthy..."
for i in $(seq 1 30); do
    PG_STATUS=$(docker inspect --format='{{.State.Health.Status}}' workforce_access_postgres 2>/dev/null || echo "starting")
    if [ "${PG_STATUS}" = "healthy" ]; then
        log "   ✓ PostgreSQL is healthy (attempt ${i})"
        break
    fi
    if [ "$i" -eq 30 ]; then
        log "❌ PostgreSQL failed to become healthy within 60s (status: ${PG_STATUS})"
        docker logs --tail=50 workforce_access_postgres 2>&1 || true
        exit 1
    fi
    sleep 2
done

# ── 5. Authenticate to ECR & pull new images ──────────────────────────────────
log "🔐 Logging in to ECR..."
ECR_REGISTRY=$(echo "${BACKEND_IMAGE}" | cut -d/ -f1)
aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"

log "⬇️  Pulling new images from ECR..."
docker compose -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    --env-file "${DEPLOY_ENV}" \
    pull backend frontend

# ── 6. Run database migrations (against healthy postgres) ─────────────────────
log "🗃️  Running database migrations..."
docker run --rm \
    --network workforce_access_network \
    --env-file "${ENV_FILE}" \
    -e DB_HOST=postgres \
    -e DB_PORT=5432 \
    "${BACKEND_IMAGE}:${IMAGE_TAG}" \
    node -e '
      const { execFileSync } = require("child_process");
      const user = encodeURIComponent(process.env.DB_USER || "workforce_admin");
      const pass = encodeURIComponent(process.env.DB_PASSWORD || "");
      const host = process.env.DB_HOST || "postgres";
      const port = process.env.DB_PORT || "5432";
      const db = process.env.DB_NAME || "workforce_access_db";
      const dbUrl = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
      console.log(`[migration] Target: postgresql://${user}:****@${host}:${port}/${db}`);
      execFileSync("/app/node_modules/.bin/node-pg-migrate", [
        "up",
        "--migrations-dir", "apps/server/db/migrations",
        "--database-url-env", "DATABASE_URL"
      ], {
        cwd: "/app",
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit"
      });
    '

# ── 7. Recreate backend & frontend application containers ─────────────────────
log "🔄 Starting/recreating application containers..."
docker compose -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    --env-file "${DEPLOY_ENV}" \
    up -d --remove-orphans

# ── 8. Wait for containers to stabilise ───────────────────────────────────────
log "⏳ Waiting for containers to stabilise (15s)..."
sleep 15

# ── 9. Verify container and service health ────────────────────────────────────
log "🔍 Checking container status..."
docker compose -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    --env-file "${DEPLOY_ENV}" \
    ps

# Backend container state
BE_STATUS=$(docker inspect --format='{{.State.Status}}' workforce_access_backend 2>/dev/null || echo "unknown")
if [ "${BE_STATUS}" != "running" ]; then
    log "❌ Backend container is not running (status: ${BE_STATUS})"
    docker logs --tail=50 workforce_access_backend 2>&1 || true
    exit 1
fi
log "   ✓ Backend container: ${BE_STATUS}"

# Backend application health — probe /health endpoint inside container
log "🩺 Probing backend /health endpoint inside container..."
for attempt in 1 2 3 4 5; do
    if docker exec workforce_access_backend \
        node -e "
          fetch('http://localhost:4000/health')
            .then(r => { if (!r.ok) process.exit(1); console.log('backend ok'); })
            .catch(() => process.exit(1));
        " 2>/dev/null; then
        log "   ✓ Backend /health: OK (attempt ${attempt})"
        break
    fi
    if [ "${attempt}" -eq 5 ]; then
        log "❌ Backend /health probe failed after 5 attempts"
        docker logs --tail=30 workforce_access_backend 2>&1 || true
        exit 1
    fi
    log "   Backend /health attempt ${attempt} failed, retrying in 5s..."
    sleep 5
done

# Frontend/Nginx container state
FE_STATUS=$(docker inspect --format='{{.State.Status}}' workforce_access_frontend 2>/dev/null || echo "unknown")
if [ "${FE_STATUS}" != "running" ]; then
    log "❌ Frontend container is not running (status: ${FE_STATUS})"
    docker logs --tail=50 workforce_access_frontend 2>&1 || true
    exit 1
fi
log "   ✓ Frontend container: ${FE_STATUS}"

# ── 10. Public HTTPS health check ─────────────────────────────────────────────
log "🌐 Running public HTTPS health check (${PUBLIC_URL})..."
for attempt in 1 2 3 4 5; do
    if curl -fsS -L --max-time 20 "${PUBLIC_URL}" -o /dev/null; then
        log "✅ Public health check passed (attempt ${attempt})"
        break
    fi
    if [ "${attempt}" -eq 5 ]; then
        log "❌ Public health check failed after 5 attempts"
        exit 1
    fi
    log "   Attempt ${attempt} failed, retrying in 10s..."
    sleep 10
done

# ── 11. Clean up dangling image layers ────────────────────────────────────────
log "🧹 Cleaning up dangling images..."
docker image prune -f || true

log "✅ Deployment of ${IMAGE_TAG} (${COMMIT_SHA}) complete!"
log "   Application live at: ${PUBLIC_URL}"
}

main "$@"
