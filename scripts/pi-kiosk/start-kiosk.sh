#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist/home-prayer-times-display/browser"
PORT="${PRAYER_KIOSK_PORT:-4173}"
URL="http://127.0.0.1:$PORT/"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/prayer-times-kiosk"
PROFILE_DIR="$CONFIG_DIR/chromium"
PAUSE_FILE="$CONFIG_DIR/paused"

find_chromium() {
  local candidate
  for candidate in chromium-browser chromium google-chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

# Chromium needs a real desktop session (Wayland labwc or X11).
# Over plain SSH there is usually no DISPLAY / WAYLAND_DISPLAY — wait or fail clearly.
ensure_graphical_env() {
  local uid runtime
  uid="$(id -u)"
  runtime="${XDG_RUNTIME_DIR:-/run/user/$uid}"
  export XDG_RUNTIME_DIR="$runtime"

  if [[ -n "${WAYLAND_DISPLAY:-}" || -n "${DISPLAY:-}" ]]; then
    return 0
  fi

  local i wayland_sock
  for i in $(seq 1 90); do
    for wayland_sock in "$runtime"/wayland-0 "$runtime"/wayland-1; do
      if [[ -S "$wayland_sock" ]]; then
        export WAYLAND_DISPLAY="$(basename "$wayland_sock")"
        export XDG_SESSION_TYPE=wayland
        echo "Using Wayland display $WAYLAND_DISPLAY"
        return 0
      fi
    done
    if [[ -S /tmp/.X11-unix/X0 ]]; then
      export DISPLAY=:0
      export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
      export XDG_SESSION_TYPE=x11
      echo "Using X11 display $DISPLAY"
      return 0
    fi
    sleep 1
  done

  cat >&2 <<'EOF'
No graphical session found (no WAYLAND_DISPLAY / DISPLAY).

This usually means start-kiosk was launched over SSH before the desktop was up.

Fix:
  1. sudo raspi-config → System Options → Auto Login → Desktop Autologin
  2. Reboot so the desktop starts, then the autostart entry can open Chromium
  3. Or on the Pi desktop itself (not SSH), run: scripts/pi-kiosk/start-kiosk.sh

To stop a failed loop: scripts/pi-kiosk/stop-kiosk.sh
EOF
  exit 1
}

is_paused() {
  [[ -f "$PAUSE_FILE" ]]
}

CHROMIUM="$(find_chromium || true)"
if [[ -z "$CHROMIUM" ]]; then
  echo "Chromium was not found. Install chromium or chromium-browser." >&2
  exit 1
fi

ensure_graphical_env

# Starting the kiosk clears a previous "stop" so reboot/autostart works again.
rm -f "$PAUSE_FILE"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "Offline build missing; building it now..."
  cd "$PROJECT_DIR"
  npm run kiosk:build
fi

mkdir -p "$PROFILE_DIR"

OZONE_ARGS=(--ozone-platform-hint=auto)
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  OZONE_ARGS=(--ozone-platform=wayland)
elif [[ -n "${DISPLAY:-}" ]]; then
  OZONE_ARGS=(--ozone-platform=x11)
fi

# Keep the attached display awake when X11 tools are available.
command -v xset >/dev/null 2>&1 && {
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true
  xset -dpms 2>/dev/null || true
}

python3 "$SCRIPT_DIR/serve.py" --directory "$DIST_DIR" --port "$PORT" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait until the local server is accepting requests.
python3 - "$PORT" <<'PY'
import socket
import sys
import time

port = int(sys.argv[1])
for _ in range(100):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            break
    except OSError:
        time.sleep(0.1)
else:
    raise SystemExit("Local kiosk server did not start")
PY

# Restart Chromium after crashes — but honor stop-kiosk.sh (pause file).
while true; do
  if is_paused; then
    echo "Kiosk paused ($PAUSE_FILE). Exiting so the desktop stays free."
    exit 0
  fi

  "$CHROMIUM" \
    --kiosk "$URL" \
    --app="$URL" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-translate \
    --overscroll-history-navigation=0 \
    --autoplay-policy=no-user-gesture-required \
    "${OZONE_ARGS[@]}" &
  CHROMIUM_PID=$!

  # While Chromium runs, watch for stop-kiosk (pause file).
  while kill -0 "$CHROMIUM_PID" 2>/dev/null; do
    if is_paused; then
      kill "$CHROMIUM_PID" 2>/dev/null || true
      wait "$CHROMIUM_PID" 2>/dev/null || true
      echo "Kiosk stopped for desktop / Wi-Fi access."
      exit 0
    fi
    sleep 0.4
  done
  wait "$CHROMIUM_PID" 2>/dev/null || true

  if is_paused; then
    echo "Kiosk paused. Exiting."
    exit 0
  fi

  # Accidental close (Ctrl+W / Alt+F4): reopen after a short delay.
  sleep 3
done
