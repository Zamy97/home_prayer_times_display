#!/usr/bin/env bash
set -euo pipefail

AUTOSTART_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/prayer-times-kiosk.desktop"
LABWC_AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/labwc/autostart"
STOP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/prayer-times-kiosk-stop.desktop"
PAUSE_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/prayer-times-kiosk/paused"

rm -f "$AUTOSTART_FILE" "$STOP_DESKTOP"
rm -f "$HOME/Desktop/Stop Prayer Times Kiosk.desktop"
rm -f "$PAUSE_FILE"

if [[ -f "$LABWC_AUTOSTART" ]] && grep -qE 'start-kiosk\.sh|start-online-kiosk\.sh|prayer-kiosk\.sh|# prayer-times-kiosk' "$LABWC_AUTOSTART"; then
  # Drop the block we appended (comment + sleep + start line), plus leftover B2 nano lines.
  tmp="$(mktemp)"
  awk '
    /^# prayer-times-kiosk/ { skip=2; next }
    skip>0 { skip--; next }
    /start-kiosk\.sh/ { next }
    /start-online-kiosk\.sh/ { next }
    /prayer-kiosk\.sh/ { next }
    { print }
  ' "$LABWC_AUTOSTART" >"$tmp"
  mv "$tmp" "$LABWC_AUTOSTART"
  echo "Removed labwc autostart entry."
fi

pkill -f "scripts/pi-kiosk/start-kiosk.sh" 2>/dev/null || true
pkill -f "scripts/pi-kiosk/start-online-kiosk.sh" 2>/dev/null || true
pkill -f "prayer-kiosk.sh" 2>/dev/null || true
pkill -f "scripts/pi-kiosk/serve.py" 2>/dev/null || true
pkill -f "prayer-times-kiosk/chromium" 2>/dev/null || true
pkill -f "prayer-times-kiosk-online/chromium" 2>/dev/null || true

echo "Prayer Times kiosk autostart removed."
echo "The project, offline build, and saved Chromium settings were left in place."
