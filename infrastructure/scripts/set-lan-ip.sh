#!/usr/bin/env bash
# Usage: bash infrastructure/scripts/set-lan-ip.sh
# Run whenever your Mac's LAN IP changes (new Wi-Fi, router reboot, etc.)
# Updates all env files and re-seeds image URLs in the database.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/../.."

# ── 1. Detect LAN IP ────────────────────────────────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || \
  ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)

if [[ -z "$LAN_IP" ]]; then
  echo "ERROR: Could not detect LAN IP. Are you connected to Wi-Fi?" >&2
  exit 1
fi

echo "Detected LAN IP: $LAN_IP"

# ── 2. Update root .env (FLOCI_PUBLIC_URL) ──────────────────────────────────
ENV_FILE="$ROOT/.env"
if grep -q '^FLOCI_PUBLIC_URL=' "$ENV_FILE"; then
  sed -i '' "s|^FLOCI_PUBLIC_URL=.*|FLOCI_PUBLIC_URL=http://$LAN_IP:4566|" "$ENV_FILE"
else
  echo "FLOCI_PUBLIC_URL=http://$LAN_IP:4566" >> "$ENV_FILE"
fi
echo "  Updated $ENV_FILE  ->  FLOCI_PUBLIC_URL=http://$LAN_IP:4566"

# ── 3. Update customer-app .env ─────────────────────────────────────────────
CAPP_ENV="$ROOT/apps/customer-app/.env"
if [[ -f "$CAPP_ENV" ]]; then
  sed -i '' "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://$LAN_IP:3000|" "$CAPP_ENV"
  sed -i '' "s|^EXPO_PUBLIC_REALTIME_URL=.*|EXPO_PUBLIC_REALTIME_URL=http://$LAN_IP:3005|" "$CAPP_ENV"
  echo "  Updated $CAPP_ENV  ->  API=$LAN_IP:3000  WS=$LAN_IP:3005"
fi

# ── 4. Re-seed images so DB URLs use the new IP ─────────────────────────────
echo ""
echo "Re-seeding images with new IP..."
cd "$ROOT"
npx ts-node --project tsconfig.base.json infrastructure/scripts/seed-images.ts

echo ""
echo "Done! Restart the Expo dev server and reload the app on your device."
echo "  cd apps/customer-app && npx expo start --clear"
