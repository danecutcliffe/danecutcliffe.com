#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "Missing app/node_modules. Install dependencies in $APP_DIR before building."
  exit 1
fi

cd "$APP_DIR"
npm run build
