#!/bin/zsh
# Dumps the SoloOS database as plain SQL into a separate private git repo and
# pushes it. Git history is the retention policy (one commit per backup).
# Usage: scripts/backup.sh
# Config (DATABASE_URL, BACKUP_REPO) comes from backup.env next to this script
# (the installed copy used by launchd) or from the project's .env.
set -euo pipefail

HERE="${0:A:h}"
for f in "$HERE/backup.env" "${HERE:h}/.env"; do
  [[ -f "$f" ]] && source <(grep -E '^(DATABASE_URL|BACKUP_REPO)=' "$f") && break
done
: "${DATABASE_URL:?DATABASE_URL not set}"
BACKUP_REPO="${BACKUP_REPO:-$HOME/Library/Application Support/SoloOS/soloos-backups}"
PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"  # launchd has a minimal PATH; gh is the git credential helper

[[ -d "$BACKUP_REPO/.git" ]] || { echo "Backup repo not found at $BACKUP_REPO"; exit 1; }

"$PG_BIN/pg_dump" --no-owner --no-privileges --file="$BACKUP_REPO/soloos.sql.tmp" "$DATABASE_URL"
mv "$BACKUP_REPO/soloos.sql.tmp" "$BACKUP_REPO/soloos.sql"

cd "$BACKUP_REPO"
git add soloos.sql
if git diff --cached --quiet; then
  echo "$(date '+%F %T') no changes"
  exit 0
fi
git commit -q -m "Backup $(date '+%F %T')"
git push -q origin HEAD
echo "$(date '+%F %T') backup pushed ($(git rev-parse --short HEAD))"
