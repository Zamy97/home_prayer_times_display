#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/prayer-times-kiosk.desktop"
LABWC_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/labwc"
LABWC_AUTOSTART="$LABWC_DIR/autostart"
LOG_FILE="$HOME/prayer-times-kiosk.log"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer must be run on the Raspberry Pi." >&2
  exit 1
fi

install_missing_packages() {
  local packages=()
  command -v python3 >/dev/null 2>&1 || packages+=(python3)
  command -v npm >/dev/null 2>&1 || packages+=(nodejs npm)

  if ! command -v chromium-browser >/dev/null 2>&1 &&
     ! command -v chromium >/dev/null 2>&1; then
    if apt-cache show chromium-browser >/dev/null 2>&1; then
      packages+=(chromium-browser)
    else
      packages+=(chromium)
    fi
  fi

  if ((${#packages[@]})); then
    echo "Installing: ${packages[*]}"
    sudo apt-get update
    sudo apt-get install -y "${packages[@]}"
  fi
}

has_graphical_session() {
  local runtime
  runtime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]] && return 0
  [[ -S "$runtime/wayland-0" || -S "$runtime/wayland-1" || -S /tmp/.X11-unix/X0 ]]
}

install_labwc_autostart() {
  # Bookworm/Trixie desktop defaults to labwc (Wayland). .desktop autostart
  # often works, but labwc's own autostart is the reliable fallback.
  mkdir -p "$LABWC_DIR"
  if [[ -f "$LABWC_AUTOSTART" ]] && grep -qF 'start-kiosk.sh' "$LABWC_AUTOSTART"; then
    return 0
  fi
  if [[ ! -f "$LABWC_AUTOSTART" ]]; then
    if [[ -f /etc/xdg/labwc/autostart ]]; then
      cp /etc/xdg/labwc/autostart "$LABWC_AUTOSTART"
    else
      printf '%s\n' '#!/bin/sh' >"$LABWC_AUTOSTART"
    fi
  fi
  {
    echo ""
    echo "# prayer-times-kiosk — offline local display"
    echo "sleep 3"
    echo "\"$SCRIPT_DIR/start-kiosk.sh\" >>\"$LOG_FILE\" 2>&1 &"
  } >>"$LABWC_AUTOSTART"
  chmod +x "$LABWC_AUTOSTART"
  echo "Also added labwc autostart: $LABWC_AUTOSTART"
}

install_missing_packages

cd "$PROJECT_DIR"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run kiosk:build

chmod +x "$SCRIPT_DIR/start-kiosk.sh" "$SCRIPT_DIR/stop-kiosk.sh" "$SCRIPT_DIR/serve.py"
mkdir -p "$AUTOSTART_DIR"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Prayer Times Kiosk
Comment=Offline full-screen prayer times display
Exec="$SCRIPT_DIR/start-kiosk.sh"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

# Easy click target on the desktop for stopping the kiosk (Wi-Fi setup).
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

install_labwc_autostart

echo
echo "Pi kiosk installed."
echo "Desktop autostart: $DESKTOP_FILE"
echo "It will start automatically after the next desktop login/reboot."
echo "To leave kiosk for Wi-Fi: Settings → Exit to desktop, or: $SCRIPT_DIR/stop-kiosk.sh"

if has_graphical_session; then
  echo "Desktop session detected — starting kiosk now..."
  nohup "$SCRIPT_DIR/start-kiosk.sh" >"$LOG_FILE" 2>&1 &
  echo "Log: $LOG_FILE"
else
  cat <<EOF
No desktop session in this terminal (common when installing over SSH).
Chromium cannot open without the Pi desktop / Wayland / X11.

Next steps:
  1. sudo raspi-config → System Options → Auto Login → Desktop Autologin
  2. sudo reboot
  3. After reboot the kiosk should open on the attached screen
  4. Check: tail -f $LOG_FILE

To stop a failed SSH start loop now:
  pkill -f start-kiosk.sh ; pkill -f 'chromium|chromium-browser' || true
EOF
fi
