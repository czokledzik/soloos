#!/bin/zsh
# Installs/removes a launchd job that runs the backup every day at 20:00
# (runs on next wake if the Mac was asleep). Usage: scripts/backup-launchd.sh install|uninstall
#
# macOS blocks launchd agents from reading ~/Documents, so the script and its
# config are copied to ~/Library/Application Support/SoloOS. Re-run install
# after changing backup.sh or DATABASE_URL.
set -euo pipefail

ROOT="${0:A:h:h}"
APP="$HOME/Library/Application Support/SoloOS"
LABEL="com.soloos.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/soloos-backup.log"

case "${1:-}" in
  install)
    mkdir -p "$APP"
    cp "$ROOT/scripts/backup.sh" "$APP/backup.sh"
    grep -E '^(DATABASE_URL|BACKUP_REPO)=' "$ROOT/.env" > "$APP/backup.env"
    chmod 600 "$APP/backup.env"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$APP/backup.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed $LABEL (daily 20:00). Log: $LOG"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL"
    ;;
  *) echo "usage: $0 install|uninstall"; exit 1 ;;
esac
