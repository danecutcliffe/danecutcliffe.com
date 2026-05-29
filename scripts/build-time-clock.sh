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
