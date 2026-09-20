#!/usr/bin/env bash
# Stop the prayer-times kiosk and leave the Pi desktop free (Wi-Fi, etc.).
# Chromium will NOT auto-reopen until you run start-kiosk.sh or reboot.
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/prayer-times-kiosk"
PAUSE_FILE="$CONFIG_DIR/paused"
PROFILE_DIR="$CONFIG_DIR/chromium"

mkdir -p "$CONFIG_DIR"
touch "$PAUSE_FILE"

# Stop the restart loop first so Chromium cannot come back.
pkill -f "scripts/pi-kiosk/start-kiosk.sh" 2>/dev/null || true
sleep 0.3

# Local static server
pkill -f "scripts/pi-kiosk/serve.py" 2>/dev/null || true

# Chromium using our kiosk profile (and any leftover windows)
pkill -f "prayer-times-kiosk/chromium" 2>/dev/null || true
if [[ -d "$PROFILE_DIR" ]]; then
  pkill -f "--user-data-dir=$PROFILE_DIR" 2>/dev/null || true
fi
# Last resort on a dedicated display Pi
pkill -f "chromium.*--kiosk" 2>/dev/null || true
pkill -f "chromium-browser.*--kiosk" 2>/dev/null || true

echo "Prayer Times kiosk stopped."
echo "Desktop is free — use the Wi-Fi menu, then either:"
echo "  ~/home_prayer_times_display/scripts/pi-kiosk/start-kiosk.sh"
echo "  or reboot (autostart will bring the kiosk back)."
