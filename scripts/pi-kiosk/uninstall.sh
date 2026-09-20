#!/usr/bin/env bash
set -euo pipefail

AUTOSTART_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/prayer-times-kiosk.desktop"
LABWC_AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/labwc/autostart"

rm -f "$AUTOSTART_FILE"

if [[ -f "$LABWC_AUTOSTART" ]] && grep -qF 'start-kiosk.sh' "$LABWC_AUTOSTART"; then
  # Drop the block we appended (comment + sleep + start line).
  tmp="$(mktemp)"
  awk '
    /^# prayer-times-kiosk/ { skip=2; next }
    skip>0 { skip--; next }
    { print }
  ' "$LABWC_AUTOSTART" >"$tmp"
  mv "$tmp" "$LABWC_AUTOSTART"
  echo "Removed labwc autostart entry."
fi

pkill -f "scripts/pi-kiosk/start-kiosk.sh" 2>/dev/null || true
pkill -f "scripts/pi-kiosk/serve.py" 2>/dev/null || true
pkill -f "prayer-times-kiosk/chromium" 2>/dev/null || true

echo "Prayer Times kiosk autostart removed."
echo "The project, offline build, and saved Chromium settings were left in place."
