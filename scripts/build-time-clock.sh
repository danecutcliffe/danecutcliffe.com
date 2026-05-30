#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
ENV_FILE="$APP_DIR/.env.local"

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "Missing app/node_modules. Install dependencies in $APP_DIR before building."
  exit 1
fi

has_vite_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { [[ -f "$ENV_FILE" ]] && grep -Eq "^${name}=.+" "$ENV_FILE"; }
}

if ! has_vite_env VITE_TIME_CLOCK_DATA_SOURCE ||
  ! has_vite_env VITE_SUPABASE_URL ||
  ! has_vite_env VITE_SUPABASE_ANON_KEY; then
  echo "Missing live Supabase env. Refusing to build a mock-mode production bundle."
  echo "Expected VITE_TIME_CLOCK_DATA_SOURCE, VITE_SUPABASE_URL, and VITE_SUPABASE_ANON_KEY in the environment or app/.env.local."
  exit 1
fi

cd "$APP_DIR"
npm run build

# Stamp the service worker cache name with a unique per-build id so every deploy
# forces clients off the previous cached shell. Without this, sw.js stays
# byte-identical across deploys and stuck browsers never pull the new app.
SW_FILE="$ROOT_DIR/time/sw.js"
if [[ -f "$SW_FILE" ]]; then
  BUILD_ID="$(date -u +%Y%m%d%H%M%S)"
  sed -i '' -E "s/time-clock-runtime-[A-Za-z0-9._-]+/time-clock-runtime-${BUILD_ID}/" "$SW_FILE"
  echo "Stamped service worker cache: time-clock-runtime-${BUILD_ID}"
else
  echo "WARNING: $SW_FILE not found; service worker cache not stamped." >&2
fi
