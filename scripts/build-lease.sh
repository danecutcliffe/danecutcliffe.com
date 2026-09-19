#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/lease-app"
ENV_FILE="$APP_DIR/.env.local"
PRODUCTION_SUPABASE_HOST="akofsmmsxtfqduebetga.supabase.co"
STAGING_SUPABASE_HOST="qumnzxzoypgpejtwbigw.supabase.co"
PRODUCTION_URL="https://danecutcliffe.com/lease/"

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "Missing lease-app/node_modules. Install dependencies in $APP_DIR before building."
  exit 1
fi

vite_env_value() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
  elif [[ -f "$ENV_FILE" ]]; then
    grep -E "^${name}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
  fi
}

SUPABASE_URL="$(vite_env_value VITE_SUPABASE_URL)"
ANON_KEY="$(vite_env_value VITE_SUPABASE_ANON_KEY)"
EMAIL_REDIRECT_TO="$(vite_env_value VITE_SUPABASE_EMAIL_REDIRECT_TO)"

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Refusing production build."
  exit 1
fi
if [[ "$SUPABASE_URL" != *"$PRODUCTION_SUPABASE_HOST"* || "$SUPABASE_URL" == *"$STAGING_SUPABASE_HOST"* ]]; then
  echo "Refusing production build because VITE_SUPABASE_URL is not the production project."
  exit 1
fi
if [[ -n "$EMAIL_REDIRECT_TO" && "$EMAIL_REDIRECT_TO" != "$PRODUCTION_URL" ]]; then
  echo "VITE_SUPABASE_EMAIL_REDIRECT_TO must be $PRODUCTION_URL."
  exit 1
fi

cd "$APP_DIR"
npm run build
node "$ROOT_DIR/scripts/verify-lease-build.mjs" "$ROOT_DIR/lease" --mode production
