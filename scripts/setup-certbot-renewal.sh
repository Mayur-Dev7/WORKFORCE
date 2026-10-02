#!/usr/bin/env bash
# scripts/setup-certbot-renewal.sh
#
# One-time setup: configure certbot auto-renewal for workforce.duckdns.org.
#
# Architecture:
#   1. Webroot directory on host: /var/www/certbot
#   2. Mounted read-only into frontend Docker container at /var/www/certbot
#   3. Nginx serves http://workforce.duckdns.org/.well-known/acme-challenge/ from /var/www/certbot
#   4. Host-level Certbot renews using the webroot authenticator (never conflicts with Nginx port 80)
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

# ── 2. Verify host-level Certbot binary ───────────────────────────────────────
# A host-level Certbot is strictly required because the renewal deploy hook
# needs to run "docker exec workforce_access_frontend nginx -s reload" directly
# on the host. Docker-in-Docker / containerized certbot is avoided for security.
if command -v certbot >/dev/null 2>&1; then
    echo "   ✓ Detected host-level Certbot: $(certbot --version 2>&1)"
else
    echo "⚠️ Host-level Certbot binary not found in PATH."
    if command -v apt-get >/dev/null 2>&1; then
        echo "→ Attempting to install host-level certbot package via apt..."
        sudo apt-get update -qq && sudo apt-get install -y certbot -qq || true
    fi

    if command -v certbot >/dev/null 2>&1; then
        echo "   ✓ Successfully installed host-level Certbot: $(certbot --version 2>&1)"
    else
        echo "❌ ERROR: Host-level certbot binary is required on Ubuntu."
        echo "   The renewal deploy hook must run 'docker exec' on the host to reload Nginx."
        echo "   Please install certbot on the host system (e.g. 'sudo apt-get install -y certbot' or via snap)"
        echo "   and re-run this script."
        exit 1
    fi
fi

# ── 3. Deploy hook — reloads Nginx inside the Docker container ────────────────
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

# ── 4. Verify existing certificate configuration ─────────────────────────────
RENEWAL_CONF="/etc/letsencrypt/renewal/${DOMAIN}.conf"
if [ ! -f "${RENEWAL_CONF}" ]; then
    echo "❌ ERROR: ${RENEWAL_CONF} not found."
    echo "   The certificate must have been issued with certbot first."
    exit 1
fi

echo "→ Checking current renewal authenticator in ${RENEWAL_CONF}..."
CURRENT_AUTH=$(grep '^authenticator' "${RENEWAL_CONF}" | awk '{print $3}' || echo "unknown")
echo "   Current authenticator: ${CURRENT_AUTH}"

# ── 5. Permanently reconfigure certificate to use webroot ─────────────────────
if [ "${CURRENT_AUTH}" != "webroot" ]; then
    echo "→ Updating renewal config to use webroot authenticator permanently..."
    
    # Try certbot reconfigure (Certbot 2.6.0+)
    if sudo certbot reconfigure --help >/dev/null 2>&1; then
        echo "   Using: certbot reconfigure --cert-name ${DOMAIN} --webroot-path ${WEBROOT}"
        sudo certbot reconfigure --cert-name "${DOMAIN}" --webroot-path "${WEBROOT}"
    else
        echo "   Using: certbot certonly --webroot --keep-until-expiring"
        sudo certbot certonly --webroot -w "${WEBROOT}" -d "${DOMAIN}" --cert-name "${DOMAIN}" --non-interactive --keep-until-expiring
    fi
    echo "   ✓ Renewal configuration permanently updated to webroot."
else
    echo "   ✓ Certificate is already configured for webroot authenticator."
fi

# ── 6. Setup automatic renewal schedule ───────────────────────────────────────
if systemctl list-timers --all 2>/dev/null | grep -q 'certbot'; then
    echo "→ certbot systemd timer is active — automatic renewals are scheduled via systemd."
else
    echo "→ Setting up cron schedule for twice-daily renewal checks..."
    CRON_LINE="0 3,15 * * * root certbot renew --quiet --no-self-upgrade 2>&1 | logger -t certbot-renew"
    CRON_FILE="/etc/cron.d/certbot-workforce"
    echo "${CRON_LINE}" | sudo tee "${CRON_FILE}" > /dev/null
    sudo chmod 644 "${CRON_FILE}"
    echo "   ✓ Cron job installed at ${CRON_FILE}"
fi

# ── 7. Run dry-run verification (FAILURE-FATAL) ────────────────────────────────
echo ""
echo "→ Running certbot renew --dry-run --run-deploy-hooks to test renewal & reload hook..."
if ! sudo certbot renew --dry-run --run-deploy-hooks --cert-name "${DOMAIN}"; then
    echo ""
    echo "❌ ERROR: Certbot dry-run with deploy hook failed!"
    echo "   Troubleshooting checks:"
    echo "   1. Ensure production containers are running: docker compose -f docker/docker-compose.prod.yml up -d"
    echo "   2. Ensure frontend container has /var/www/certbot mounted"
    echo "   3. Ensure public port 80 routes to the frontend container"
    echo "   4. Ensure DNS workforce.duckdns.org points to this server IP"
    exit 1
fi

echo ""
echo "=== Setup complete ==="
echo "Certbot will automatically renew ${DOMAIN} when within 30 days of expiry."
echo "Nginx in ${CONTAINER} will reload seamlessly upon renewal."
