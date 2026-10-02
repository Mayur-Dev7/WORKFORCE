#!/usr/bin/env bash
# scripts/setup-certbot-renewal.sh
#
# One-time setup: configure certbot auto-renewal for workforce.duckdns.org.
#
# The frontend Nginx container occupies port 80, so standard certbot "standalone"
# mode cannot be used for renewal. We use the "webroot" or "nginx" plugin instead,
# but because our Nginx is inside Docker, the simplest reliable approach is:
#
#   1. A certbot deploy-hook that reloads Nginx inside the running Docker container
#      after every successful renewal. No port conflicts. No downtime.
#
#   2. A systemd timer (preferred) or cron job that runs "certbot renew" twice daily.
#      Certbot skips renewal if the cert is still valid for > 30 days.
#
# Run this script ONCE on the EC2 (via ssh workforce-ec2 or SSM Session Manager).
# It is safe to re-run.

set -euo pipefail

DOMAIN="workforce.duckdns.org"
CONTAINER="workforce_access_frontend"

echo "=== Setting up certbot auto-renewal for ${DOMAIN} ==="

# ── 1. Deploy hook — reloads Nginx inside the Docker container ────────────────
# Certbot runs this automatically after a successful renewal.
DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
echo "→ Installing deploy hook at ${DEPLOY_HOOK}..."

sudo tee "${DEPLOY_HOOK}" > /dev/null << 'HOOK'
#!/usr/bin/env bash
# Reload Nginx inside the running Docker frontend container after cert renewal.
# Called automatically by certbot after a successful renewal.
set -euo pipefail
CONTAINER="workforce_access_frontend"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[certbot-hook] Reloading Nginx in ${CONTAINER}..."
    docker exec "${CONTAINER}" nginx -s reload
    echo "[certbot-hook] Nginx reloaded."
else
    echo "[certbot-hook] WARNING: container ${CONTAINER} is not running — skipping reload."
fi
HOOK

sudo chmod +x "${DEPLOY_HOOK}"
echo "   ✓ Deploy hook installed."

# ── 2. Certbot renewal uses the existing certificate's config ─────────────────
# Certbot stores renewal configuration in /etc/letsencrypt/renewal/<domain>.conf
# It was written when the certificate was first issued and already contains the
# correct authenticator (likely dns-duckdns or webroot).
#
# Verify the renewal config exists:
RENEWAL_CONF="/etc/letsencrypt/renewal/${DOMAIN}.conf"
if [ ! -f "${RENEWAL_CONF}" ]; then
    echo "ERROR: ${RENEWAL_CONF} not found."
    echo "The certificate must have been issued with certbot first."
    exit 1
fi
echo "→ Renewal config found at ${RENEWAL_CONF}."
echo "   Authenticator: $(grep '^authenticator' "${RENEWAL_CONF}" || echo 'not found')"

# ── 3. Install certbot systemd timer (preferred over cron) ────────────────────
# Most modern Ubuntu installs already have this from the snap certbot package.
if systemctl list-timers --all | grep -q 'certbot'; then
    echo "→ certbot systemd timer already active — no cron needed."
    systemctl status snap.certbot.renew.timer 2>/dev/null \
        || systemctl status certbot.timer 2>/dev/null \
        || true
else
    echo "→ No systemd certbot timer found. Installing a cron job instead..."
    # Twice daily, at a random minute offset to reduce Let's Encrypt load
    CRON_LINE="0 3,15 * * * root certbot renew --quiet --no-self-upgrade 2>&1 | logger -t certbot-renew"
    CRON_FILE="/etc/cron.d/certbot-workforce"
    echo "${CRON_LINE}" | sudo tee "${CRON_FILE}" > /dev/null
    sudo chmod 644 "${CRON_FILE}"
    echo "   ✓ Cron job installed at ${CRON_FILE}"
fi

# ── 4. Dry-run to verify renewal works ────────────────────────────────────────
echo ""
echo "→ Running certbot renew --dry-run to verify configuration..."
echo "   (This does NOT actually renew the certificate.)"
echo ""
sudo certbot renew --dry-run --cert-name "${DOMAIN}"

echo ""
echo "=== Setup complete ==="
echo "Certbot will automatically renew ${DOMAIN} when it is within 30 days of expiry."
echo "After renewal, the deploy hook will reload Nginx inside the Docker container."
echo ""
echo "To manually test a real renewal (only when cert is near expiry):"
echo "  sudo certbot renew --cert-name ${DOMAIN}"
echo ""
echo "To manually reload Nginx after cert replacement:"
echo "  docker exec ${CONTAINER} nginx -s reload"
