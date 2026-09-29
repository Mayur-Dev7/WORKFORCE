#!/usr/bin/env bash
set -e

# Change directory to project root
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

clear || true
echo "==========================================================="
echo "   🚀 WORKFORCE ACCESS PLATFORM - ONE-CLICK LAUNCHER"
echo "==========================================================="

# 1. Check & start PostgreSQL container if stopped
if ! docker ps --format '{{.Names}}' | grep -q "^workforce_access_postgres$"; then
  echo "📦 Starting PostgreSQL database container..."
  docker start workforce_access_postgres 2>/dev/null || true
  sleep 1
fi

# 2. Dynamically detect LAN IP address (WiFi / Ethernet)
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="localhost"
fi

MOBILE_URL="https://${LOCAL_IP}:5173"

echo ""
echo "📱 MOBILE WEB ACCESS URL:"
echo "👉 $MOBILE_URL"
echo ""
echo "📱 Scan this QR code with your mobile phone camera to open:"
echo "-----------------------------------------------------------"
npx --yes qrcode-terminal "$MOBILE_URL" --small 2>/dev/null || true
echo "-----------------------------------------------------------"
echo ""
echo "ℹ️  NOTE FOR MOBILE BROWSER (Chrome / Safari):"
echo "   Because mobile browsers require HTTPS for Camera & GPS access,"
echo "   a local self-signed certificate is used."
echo "   When your phone shows 'Your connection is not private':"
echo "   👉 Tap 'Advanced' -> Tap 'Proceed to ${LOCAL_IP} (unsafe)'"
echo ""
echo "==========================================================="
echo "Starting Backend (port 4000) and Frontend (port 5173)..."
echo "Press Ctrl+C to stop."
echo "==========================================================="
echo ""

exec npm run dev
