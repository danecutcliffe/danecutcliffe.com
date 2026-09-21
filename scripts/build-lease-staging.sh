#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/lease-app"
ENV_FILE="$APP_DIR/.env.staging.local"
STAGING_SUPABASE_HOST="qumnzxzoypgpejtwbigw.supabase.co"
STAGING_URL="https://staging.danecutcliffe.com/lease/"

if [[ ! -d "$APP_DIR/node_modules" || ! -f "$ENV_FILE" ]]; then
  echo "Staging dependencies or $ENV_FILE are missing."
  exit 1
fi

SUPABASE_URL="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
SUPABASE_ANON_KEY="$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
EMAIL_REDIRECT_TO="$(grep -E '^VITE_SUPABASE_EMAIL_REDIRECT_TO=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
if [[ "$SUPABASE_URL" != *"$STAGING_SUPABASE_HOST"* ]]; then
  echo "Refusing staging build because VITE_SUPABASE_URL is not the staging project."
  exit 1
fi
if [[ -z "$SUPABASE_ANON_KEY" ]]; then
  echo "VITE_SUPABASE_ANON_KEY is required for the staging build."
  exit 1
fi
if [[ -n "$EMAIL_REDIRECT_TO" && "$EMAIL_REDIRECT_TO" != "$STAGING_URL" ]]; then
  echo "VITE_SUPABASE_EMAIL_REDIRECT_TO must be $STAGING_URL."
  exit 1
fi

cd "$APP_DIR"
npm run verify
npx vite build --mode staging --outDir "$ROOT_DIR/staging-site/lease" --emptyOutDir
node "$ROOT_DIR/scripts/verify-lease-build.mjs" "$ROOT_DIR/staging-site/lease" --mode staging
