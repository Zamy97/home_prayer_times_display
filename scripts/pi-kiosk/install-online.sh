#!/usr/bin/env bash
# Switch this Pi from the offline local kiosk (B1) to the hosted URL (B2).
# Safe to re-run. Removes leftover B1 autostart (including labwc) first.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/prayer-times-kiosk.desktop"
LABWC_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/labwc"
LABWC_AUTOSTART="$LABWC_DIR/autostart"
LOG_FILE="$HOME/prayer-times-kiosk.log"
ONLINE_SCRIPT="$SCRIPT_DIR/start-online-kiosk.sh"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer must be run on the Raspberry Pi." >&2
  exit 1
fi

has_graphical_session() {
  local runtime
  runtime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]] && return 0
  [[ -S "$runtime/wayland-0" || -S "$runtime/wayland-1" || -S /tmp/.X11-unix/X0 ]]
}

strip_labwc_kiosk() {
  [[ -f "$LABWC_AUTOSTART" ]] || return 0
  local tmp
  tmp="$(mktemp)"
  awk '
    /^# prayer-times-kiosk/ { skip=2; next }
    skip>0 { skip--; next }
    /start-kiosk\.sh/ { next }
    /prayer-kiosk\.sh/ { next }
    /start-online-kiosk\.sh/ { next }
    { print }
  ' "$LABWC_AUTOSTART" >"$tmp"
  mv "$tmp" "$LABWC_AUTOSTART"
}

install_labwc_online() {
  mkdir -p "$LABWC_DIR"
  if [[ ! -f "$LABWC_AUTOSTART" ]]; then
    if [[ -f /etc/xdg/labwc/autostart ]]; then
      cp /etc/xdg/labwc/autostart "$LABWC_AUTOSTART"
    else
      printf '%s\n' '#!/bin/sh' >"$LABWC_AUTOSTART"
    fi
  fi
  strip_labwc_kiosk
  {
    echo ""
    echo "# prayer-times-kiosk — online hosted display"
    echo "sleep 3"
    echo "\"$ONLINE_SCRIPT\" >>\"$LOG_FILE\" 2>&1 &"
  } >>"$LABWC_AUTOSTART"
  chmod +x "$LABWC_AUTOSTART"
  echo "labwc autostart: $LABWC_AUTOSTART"
}

echo "Stopping the offline (B1) kiosk so it cannot fight the online one..."
"$SCRIPT_DIR/uninstall.sh" || true
"$SCRIPT_DIR/stop-kiosk.sh" || true
pkill -f "prayer-kiosk.sh" 2>/dev/null || true
pkill -f "start-online-kiosk.sh" 2>/dev/null || true
pkill -f "prayer-times-kiosk-online/chromium" 2>/dev/null || true
sleep 0.4

chmod +x "$ONLINE_SCRIPT" "$SCRIPT_DIR/stop-kiosk.sh"
mkdir -p "$AUTOSTART_DIR"

# Always write $HOME — never a REPLACE_USER placeholder.
cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Prayer Times Kiosk
Comment=Full-screen hosted prayer times display
Exec="$ONLINE_SCRIPT"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

# Desktop shortcut to leave kiosk (Wi-Fi / desktop).
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS_DIR"
cat >"$APPS_DIR/prayer-times-kiosk-stop.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Stop Prayer Times Kiosk
Comment=Close kiosk so you can use Wi-Fi / desktop
Exec="$SCRIPT_DIR/stop-kiosk.sh"
Terminal=true
Categories=Utility;
EOF
if [[ -d "$HOME/Desktop" ]]; then
  cp "$APPS_DIR/prayer-times-kiosk-stop.desktop" "$HOME/Desktop/Stop Prayer Times Kiosk.desktop"
  chmod +x "$HOME/Desktop/Stop Prayer Times Kiosk.desktop" 2>/dev/null || true
fi

install_labwc_online

# If someone already created the B2 nano script, leave it but do not autostart it.
if [[ -x "$HOME/bin/prayer-kiosk.sh" ]]; then
  echo "Note: leftover $HOME/bin/prayer-kiosk.sh is ignored. Autostart uses:"
  echo "  $ONLINE_SCRIPT"
fi

echo
echo "Online kiosk installed."
echo "URL: https://home-prayer-times-display.vercel.app/"
echo "Desktop autostart: $DESKTOP_FILE"
echo "House settings from the offline profile do not carry over — re-enter Settings once."
echo "Keep Wi-Fi on."

if has_graphical_session; then
  echo "Desktop session detected — starting online kiosk now..."
  nohup "$ONLINE_SCRIPT" >>"$LOG_FILE" 2>&1 &
  echo "Log: $LOG_FILE"
else
  cat <<EOF
No desktop session in this terminal (common over SSH).
Enable Desktop Autologin, then: sudo reboot
After reboot Chromium should open the Vercel site, not http://127.0.0.1:4173/
Check: tail -f $LOG_FILE
EOF
fi
