#!/usr/bin/env bash
# rollback-ec2.sh — restore the previous deployment tag
# Usage: bash scripts/rollback-ec2.sh [ROLLBACK_TAG]
# If ROLLBACK_TAG is omitted, uses PREVIOUS_TAG from .env.deploy

set -euo pipefail

APP_DIR="/home/ubuntu/apps/WORKFORCE"
COMPOSE_FILE="${APP_DIR}/docker/docker-compose.prod.yml"
ENV_FILE="${APP_DIR}/apps/server/.env"
DEPLOY_ENV="${APP_DIR}/.env.deploy"
AWS_REGION="ap-south-1"
HEALTH_URL="https://workforce.duckdns.org"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

# Load current deploy env
if [ ! -f "${DEPLOY_ENV}" ]; then
    echo "ERROR: ${DEPLOY_ENV} not found — cannot rollback" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "${DEPLOY_ENV}"

# Override tag if passed as argument
ROLLBACK_TAG="${1:-${PREVIOUS_TAG}}"

if [ -z "${ROLLBACK_TAG}" ]; then
    echo "ERROR: No rollback tag available" >&2
    exit 1
fi

log "⏪ Rolling back to tag: ${ROLLBACK_TAG}"
log "   Backend:  ${BACKEND_IMAGE}:${ROLLBACK_TAG}"
log "   Frontend: ${FRONTEND_IMAGE}:${ROLLBACK_TAG}"

cd "${APP_DIR}"

# ECR login
ECR_REGISTRY=$(echo "${BACKEND_IMAGE}" | cut -d/ -f1)
aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Write rollback deploy env with restricted permissions
(
  umask 077
  cat > "${DEPLOY_ENV}" << EOF
BACKEND_IMAGE=${BACKEND_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
IMAGE_TAG=${ROLLBACK_TAG}
PREVIOUS_TAG=${IMAGE_TAG}
BACKEND_DATABASE_URL=${BACKEND_DATABASE_URL:-}
DEPLOY_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
)
chmod 600 "${DEPLOY_ENV}"

# Pull rollback images
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --env-file "${DEPLOY_ENV}" pull backend frontend

# Restart with rollback images
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --env-file "${DEPLOY_ENV}" up -d --remove-orphans

sleep 10

# Health check
for attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 15 "${HEALTH_URL}" -o /dev/null; then
        log "✅ Rollback health check passed (attempt ${attempt})"
        break
    fi
    if [ "${attempt}" -eq 5 ]; then
        log "❌ Rollback health check failed!"
        exit 1
    fi
    sleep 10
done

log "✅ Rollback to ${ROLLBACK_TAG} complete!"
