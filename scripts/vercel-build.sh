#!/usr/bin/env bash
# Vercel build: apply DB migrations for production deploys, then build.
# Preview deploys never migrate, so a branch can't change the production schema.
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  if [[ -n "${DATABASE_URL_UNPOOLED:-}${DATABASE_URL:-}" ]]; then
    echo "Applying database migrations…"
    pnpm db:migrate
  else
    echo "No DATABASE_URL set; skipping migrations."
  fi
fi

pnpm build
