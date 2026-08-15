#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist/home-prayer-times-display/browser"
PORT="${PRAYER_KIOSK_PORT:-4173}"
URL="http://127.0.0.1:$PORT/"
PROFILE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/prayer-times-kiosk/chromium"

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

CHROMIUM="$(find_chromium || true)"
if [[ -z "$CHROMIUM" ]]; then
  echo "Chromium was not found. Install chromium or chromium-browser." >&2
  exit 1
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "Offline build missing; building it now..."
  cd "$PROJECT_DIR"
  npm run kiosk:build
fi

mkdir -p "$PROFILE_DIR"

# Keep the attached display awake. These are harmless on Wayland/non-X11.
command -v xset >/dev/null 2>&1 && {
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true
  xset -dpms 2>/dev/null || true
}

# Hide the pointer after a short idle period when available.
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 1 -root >/dev/null 2>&1 &
  UNCLUTTER_PID=$!
else
  UNCLUTTER_PID=""
fi

python3 "$SCRIPT_DIR/serve.py" --directory "$DIST_DIR" --port "$PORT" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "$UNCLUTTER_PID" ]] && kill "$UNCLUTTER_PID" 2>/dev/null || true
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

# Restart Chromium if it ever crashes or is accidentally closed.
while true; do
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
    --ozone-platform-hint=auto || true
  sleep 3
done
