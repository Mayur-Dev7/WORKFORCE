#!/usr/bin/env bash
# scripts/setup-certbot-renewal.sh
#
# One-time setup: configure certbot auto-renewal for workforce.duckdns.org.
#
# Architecture:
#   1. Webroot directory on host: /var/www/certbot
#   2. Mounted read-only into frontend Docker container at /var/www/certbot
#   3. Nginx serves http://workforce.duckdns.org/.well-known/acme-challenge/ from /var/www/certbot
#   4. Certbot renews using the webroot authenticator (never conflicts with Nginx port 80)
#   5. Certbot deploy hook executes "docker exec workforce_access_frontend nginx -s reload"
#      upon successful renewal to reload the new certificate with zero downtime.
#
# Run this script ONCE on the EC2 (via ssh workforce-ec2 or SSM Session Manager).
# It is safe to re-run.

set -euo pipefail

DOMAIN="workforce.duckdns.org"
CONTAINER="workforce_access_frontend"
WEBROOT="/var/www/certbot"

echo "=== Setting up certbot auto-renewal for ${DOMAIN} ==="

# ── 1. Create webroot directory on host ───────────────────────────────────────
echo "→ Creating webroot challenge directory at ${WEBROOT}..."
sudo mkdir -p "${WEBROOT}"
sudo chmod 755 "${WEBROOT}"
echo "   ✓ Webroot directory ready."

# ── 2. Deploy hook — reloads Nginx inside the Docker container ────────────────
DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
echo "→ Installing deploy hook at ${DEPLOY_HOOK}..."
sudo mkdir -p "$(dirname "${DEPLOY_HOOK}")"

sudo tee "${DEPLOY_HOOK}" > /dev/null << 'HOOK'
#!/usr/bin/env bash
# Reload Nginx inside the running Docker frontend container after cert renewal.
# Called automatically by certbot after a successful renewal.
set -euo pipefail
CONTAINER="workforce_access_frontend"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[certbot-hook] Reloading Nginx in ${CONTAINER}..."
    docker exec "${CONTAINER}" nginx -s reload
    echo "[certbot-hook] Nginx reloaded successfully."
else
    echo "[certbot-hook] WARNING: container ${CONTAINER} is not running — skipping reload."
fi
HOOK

sudo chmod +x "${DEPLOY_HOOK}"
echo "   ✓ Deploy hook installed."

# ── 3. Configure renewal to use webroot authenticator ─────────────────────────
RENEWAL_CONF="/etc/letsencrypt/renewal/${DOMAIN}.conf"
if [ ! -f "${RENEWAL_CONF}" ]; then
    echo "ERROR: ${RENEWAL_CONF} not found."
    echo "The certificate must have been issued with certbot first."
    exit 1
fi

echo "→ Checking current renewal authenticator in ${RENEWAL_CONF}..."
CURRENT_AUTH=$(grep '^authenticator' "${RENEWAL_CONF}" | awk '{print $3}' || echo "unknown")
echo "   Current authenticator: ${CURRENT_AUTH}"

if [ "${CURRENT_AUTH}" != "webroot" ]; then
    echo "→ Updating renewal config to use webroot authenticator (/var/www/certbot)..."
    # Ensure certbot renewal config uses webroot so port 80 is not claimed by standalone certbot
    sudo certbot certonly --webroot -w "${WEBROOT}" -d "${DOMAIN}" --cert-name "${DOMAIN}" --dry-run || {
        echo "Note: If dry-run failed because frontend container is not yet running on port 80,"
        echo "start the production containers first with: docker compose -f docker/docker-compose.prod.yml up -d"
    }
fi

# ── 4. Verify certbot systemd timer or cron ──────────────────────────────────
if systemctl list-timers --all 2>/dev/null | grep -q 'certbot'; then
    echo "→ certbot systemd timer is active — automatic renewals scheduled."
else
    echo "→ No systemd certbot timer found. Installing cron job..."
    CRON_LINE="0 3,15 * * * root certbot renew --quiet --no-self-upgrade 2>&1 | logger -t certbot-renew"
    CRON_FILE="/etc/cron.d/certbot-workforce"
    echo "${CRON_LINE}" | sudo tee "${CRON_FILE}" > /dev/null
    sudo chmod 644 "${CRON_FILE}"
    echo "   ✓ Cron job installed at ${CRON_FILE}"
fi

# ── 5. Run dry-run test ───────────────────────────────────────────────────────
echo ""
echo "→ Running certbot renew --dry-run..."
sudo certbot renew --dry-run --cert-name "${DOMAIN}" || {
    echo "⚠️ Dry-run reported an issue. Ensure frontend Docker container is running and port 80 is forwarded."
}

echo ""
echo "=== Setup complete ==="
echo "Certbot will automatically renew ${DOMAIN} when within 30 days of expiry."
echo "Nginx in ${CONTAINER} will reload seamlessly upon renewal."
