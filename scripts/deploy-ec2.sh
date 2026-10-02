#!/usr/bin/env bash
# deploy-ec2.sh — runs on EC2 via AWS SSM
# Invoked by GitHub Actions: deploy.yml Job 3
# Required env vars (set by SSM caller): BACKEND_IMAGE  FRONTEND_IMAGE  IMAGE_TAG

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

# ── 0. Validate required env vars ────────────────────────────────────────────
: "${BACKEND_IMAGE:?BACKEND_IMAGE must be set by the SSM caller}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE must be set by the SSM caller}"
: "${IMAGE_TAG:?IMAGE_TAG must be set by the SSM caller}"

log "🚀 Starting deployment of tag: ${IMAGE_TAG}"
log "   Backend:  ${BACKEND_IMAGE}:${IMAGE_TAG}"
log "   Frontend: ${FRONTEND_IMAGE}:${IMAGE_TAG}"

# ── 1. Save previous tag for rollback (before anything changes) ───────────────
PREVIOUS_TAG=""
if [ -f "${DEPLOY_ENV}" ]; then
    PREVIOUS_TAG=$(grep '^IMAGE_TAG=' "${DEPLOY_ENV}" 2>/dev/null | cut -d= -f2 || true)
    log "   Previous tag: ${PREVIOUS_TAG:-<none>}"
fi

# ── 2. Update repository ──────────────────────────────────────────────────────
# git reset --hard updates tracked files (Dockerfiles, compose, scripts etc.)
# It does NOT touch untracked files, so apps/server/.env and .env.deploy are safe.
# Both files are in .gitignore so git will never touch them.
log "📦 Updating repository..."
cd "${APP_DIR}"
git fetch origin main
git reset --hard origin/main
# Restore execute bit on scripts (git may reset file modes)
chmod +x "${APP_DIR}/scripts/deploy-ec2.sh"
chmod +x "${APP_DIR}/scripts/rollback-ec2.sh"

# ── 3. Write deployment env file (image versions & safe DB URL) ───────────────
# Compute safe, URL-encoded DATABASE_URL targeting the internal Docker service
# "postgres:5432", overriding any localhost:5433 value in apps/server/.env.
BACKEND_DATABASE_URL=$(node -e '
  const fs = require("fs");
  const envPath = process.argv[1];
  let user = "workforce_admin", pass = "", name = "workforce_access_db";
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const get = (k) => {
      const m = content.match(new RegExp(`^${k}=(.*)$`, "m"));
      return m ? m[1].trim() : null;
    };
    user = get("DB_USER") || get("POSTGRES_USER") || user;
    pass = get("DB_PASSWORD") || get("POSTGRES_PASSWORD") || pass;
    name = get("DB_NAME") || get("POSTGRES_DB") || name;
  }
  process.stdout.write(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@postgres:5432/${name}`);
' "${ENV_FILE}" 2>/dev/null || echo "postgresql://workforce_admin@postgres:5432/workforce_access_db")

log "📝 Writing .env.deploy with restricted 0600 permissions..."
(
  umask 077
  cat > "${DEPLOY_ENV}" << EOF
BACKEND_IMAGE=${BACKEND_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
IMAGE_TAG=${IMAGE_TAG}
PREVIOUS_TAG=${PREVIOUS_TAG}
BACKEND_DATABASE_URL=${BACKEND_DATABASE_URL}
DEPLOY_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
)
chmod 600 "${DEPLOY_ENV}"

# ── 4. Login to ECR ───────────────────────────────────────────────────────────
log "🔐 Logging in to ECR..."
ECR_REGISTRY=$(echo "${BACKEND_IMAGE}" | cut -d/ -f1)
aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── 5. Pull new images ─────────────────────────────────────────────────────────
log "⬇️  Pulling new images from ECR..."
docker compose -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    --env-file "${DEPLOY_ENV}" \
    pull backend frontend

# ── 6. Run database migrations ────────────────────────────────────────────────
# CRITICAL: DATABASE_URL must point to the Docker service "postgres:5432",
# NOT to "localhost:5433" (which is the dev value in apps/server/.env).
# We use Node to safely URL-encode DB_USER and DB_PASSWORD (handling any special
# characters such as @, #, :, /, %, etc.) and invoke the hoisted migration CLI.
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

# ── 7. Recreate containers ─────────────────────────────────────────────────────
log "🔄 Restarting application containers..."
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

# PostgreSQL health (uses Docker healthcheck)
PG_STATUS=$(docker inspect --format='{{.State.Health.Status}}' workforce_access_postgres 2>/dev/null || echo "unknown")
if [ "${PG_STATUS}" != "healthy" ]; then
    log "❌ PostgreSQL is not healthy (status: ${PG_STATUS})"
    exit 1
fi
log "   ✓ PostgreSQL: ${PG_STATUS}"

# Backend container state
BE_STATUS=$(docker inspect --format='{{.State.Status}}' workforce_access_backend 2>/dev/null || echo "unknown")
if [ "${BE_STATUS}" != "running" ]; then
    log "❌ Backend container is not running (status: ${BE_STATUS})"
    docker logs --tail=50 workforce_access_backend 2>&1 || true
    exit 1
fi
log "   ✓ Backend container: ${BE_STATUS}"

# Backend application health — probe the /health endpoint inside the container
# (does not depend on Nginx or public routing)
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
    # -L follows redirects; -f fails on 4xx/5xx; --max-time caps the wait
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

log "✅ Deployment of ${IMAGE_TAG} complete!"
log "   Application live at: ${PUBLIC_URL}"
