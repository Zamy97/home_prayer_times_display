#!/usr/bin/env bash
set -euo pipefail

AUTOSTART_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/prayer-times-kiosk.desktop"
rm -f "$AUTOSTART_FILE"
pkill -f "scripts/pi-kiosk/start-kiosk.sh" 2>/dev/null || true
pkill -f "scripts/pi-kiosk/serve.py" 2>/dev/null || true

echo "Prayer Times kiosk autostart removed."
echo "The project, offline build, and saved Chromium settings were left in place."
