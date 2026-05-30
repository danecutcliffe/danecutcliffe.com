#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
ENV_FILE="$APP_DIR/.env.staging.local"
PRODUCTION_SUPABASE_HOST="akofsmmsxtfqduebetga.supabase.co"
STAGING_URL="https://staging.danecutcliffe.com/time/"

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "Missing app/node_modules. Install dependencies in $APP_DIR before building."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing staging env file: $ENV_FILE"
  echo "Create it from app/.env.staging.example after the staging Supabase project exists."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required_vars=(
  VITE_TIME_CLOCK_DATA_SOURCE
  VITE_APP_ENV
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  VITE_SUPABASE_EMAIL_REDIRECT_TO
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name in $ENV_FILE."
    exit 1
  fi
done

if [[ "${VITE_APP_ENV}" != "staging" ]]; then
  echo "Refusing staging build because VITE_APP_ENV is '${VITE_APP_ENV}', not 'staging'."
  exit 1
fi

if [[ "${VITE_TIME_CLOCK_DATA_SOURCE}" != "supabase" ]]; then
  echo "Refusing staging build because VITE_TIME_CLOCK_DATA_SOURCE must be 'supabase'."
  exit 1
fi

if [[ "${VITE_SUPABASE_URL}" == *"${PRODUCTION_SUPABASE_HOST}"* ]]; then
  echo "Refusing staging build because VITE_SUPABASE_URL points at the production Supabase project."
  exit 1
fi

if [[ "${VITE_SUPABASE_EMAIL_REDIRECT_TO}" != "${STAGING_URL}" ]]; then
  echo "Refusing staging build because VITE_SUPABASE_EMAIL_REDIRECT_TO must be ${STAGING_URL}."
  exit 1
fi

export VITE_APP_BASE_PATH="${VITE_APP_BASE_PATH:-/time/}"
export VITE_BUILD_OUT_DIR="${VITE_BUILD_OUT_DIR:-../staging-site/time}"

cd "$APP_DIR"
npm run build -- --mode staging

cat > "$ROOT_DIR/staging-site/time/scope-admin-integration.js" <<'EOF'
console.info("Scope admin integration is disabled in the staging Time Clock environment.");
EOF
cat > "$ROOT_DIR/staging-site/time/scope-employee-integration.js" <<'EOF'
console.info("Scope employee integration is disabled in the staging Time Clock environment.");
EOF
printf '%s\n' 'staging.danecutcliffe.com' > "$ROOT_DIR/staging-site/CNAME"
printf '%s\n' '<!doctype html><meta http-equiv="refresh" content="0; url=/time/"><link rel="canonical" href="/time/"><title>Time Clock Staging</title>' > "$ROOT_DIR/staging-site/index.html"
touch "$ROOT_DIR/staging-site/.nojekyll"
