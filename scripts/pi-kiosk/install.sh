#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/prayer-times-kiosk.desktop"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer must be run on the Raspberry Pi." >&2
  exit 1
fi

install_missing_packages() {
  local packages=()
  command -v python3 >/dev/null 2>&1 || packages+=(python3)
  command -v npm >/dev/null 2>&1 || packages+=(nodejs npm)
  command -v unclutter >/dev/null 2>&1 || packages+=(unclutter)

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

install_missing_packages

cd "$PROJECT_DIR"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run kiosk:build

chmod +x "$SCRIPT_DIR/start-kiosk.sh" "$SCRIPT_DIR/serve.py"
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

echo
echo "Pi kiosk installed."
echo "It will start automatically after the next desktop login/reboot."
echo "Starting it now..."
nohup "$SCRIPT_DIR/start-kiosk.sh" >"$HOME/prayer-times-kiosk.log" 2>&1 &
echo "Log: $HOME/prayer-times-kiosk.log"
