#!/usr/bin/env bash
# Builds and serves the app for Playwright. `exec` makes the server replace this
# shell, so Playwright's shutdown signal reaches it directly.
set -euo pipefail
pnpm build
exec node_modules/.bin/next start -H 127.0.0.1 -p "${PORT:-3100}"
