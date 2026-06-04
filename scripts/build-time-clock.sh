#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
ENV_FILE="$APP_DIR/.env.local"
PRODUCTION_SUPABASE_HOST="akofsmmsxtfqduebetga.supabase.co"
STAGING_SUPABASE_HOST="qumnzxzoypgpejtwbigw.supabase.co"
PRODUCTION_URL="https://danecutcliffe.com/time/"

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "Missing app/node_modules. Install dependencies in $APP_DIR before building."
  exit 1
fi

has_vite_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { [[ -f "$ENV_FILE" ]] && grep -Eq "^${name}=.+" "$ENV_FILE"; }
}

vite_env_value() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
  elif [[ -f "$ENV_FILE" ]]; then
    grep -E "^${name}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
  fi
}

if ! has_vite_env VITE_TIME_CLOCK_DATA_SOURCE ||
  ! has_vite_env VITE_SUPABASE_URL ||
  ! has_vite_env VITE_SUPABASE_ANON_KEY; then
  echo "Missing live Supabase env. Refusing to build a mock-mode production bundle."
  echo "Expected VITE_TIME_CLOCK_DATA_SOURCE, VITE_SUPABASE_URL, and VITE_SUPABASE_ANON_KEY in the environment or app/.env.local."
  exit 1
fi

DATA_SOURCE_MODE="$(vite_env_value VITE_TIME_CLOCK_DATA_SOURCE)"
APP_ENV="$(vite_env_value VITE_APP_ENV)"
SUPABASE_URL="$(vite_env_value VITE_SUPABASE_URL)"
EMAIL_REDIRECT_TO="$(vite_env_value VITE_SUPABASE_EMAIL_REDIRECT_TO)"

if [[ "${DATA_SOURCE_MODE}" != "supabase" ]]; then
  echo "Refusing production build because VITE_TIME_CLOCK_DATA_SOURCE must be 'supabase'."
  exit 1
fi

if [[ -n "${APP_ENV}" && "${APP_ENV}" != "production" ]]; then
  echo "Refusing production build because VITE_APP_ENV is '${APP_ENV}', not 'production'."
  exit 1
fi

if [[ "${SUPABASE_URL}" != *"${PRODUCTION_SUPABASE_HOST}"* ]]; then
  echo "Refusing production build because VITE_SUPABASE_URL does not point at the production Supabase project."
  exit 1
fi

if [[ "${SUPABASE_URL}" == *"${STAGING_SUPABASE_HOST}"* ]]; then
  echo "Refusing production build because VITE_SUPABASE_URL points at the staging Supabase project."
  exit 1
fi

if [[ -n "${EMAIL_REDIRECT_TO}" && "${EMAIL_REDIRECT_TO}" != "${PRODUCTION_URL}" ]]; then
  echo "Refusing production build because VITE_SUPABASE_EMAIL_REDIRECT_TO must be ${PRODUCTION_URL}."
  exit 1
fi

cd "$APP_DIR"
# npm run build also stamps time/sw.js with a unique per-build cache id
# (postbuild: node ../scripts/stamp-sw.mjs), so every deploy busts stale clients.
npm run build
node "$ROOT_DIR/scripts/verify-time-build.mjs" "$ROOT_DIR/time" --mode production
