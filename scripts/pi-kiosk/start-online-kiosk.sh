#!/usr/bin/env bash
# Full-screen Chromium to the hosted prayer-times site (B2).
# Requires internet. House settings live in a separate Chromium profile
# from the offline kiosk, so re-enter Settings once after switching.
set -euo pipefail

URL="${PRAYER_KIOSK_URL:-https://home-prayer-times-display.vercel.app/}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/prayer-times-kiosk-online"
PROFILE_DIR="$CONFIG_DIR/chromium"
PAUSE_FILE="$CONFIG_DIR/paused"
LOCK_FILE="$CONFIG_DIR/kiosk.lock"
LOG_FILE="${PRAYER_KIOSK_LOG:-$HOME/prayer-times-kiosk.log}"

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

This usually means the online kiosk was launched over SSH before the desktop was up.

Fix:
  1. sudo raspi-config → System Options → Auto Login → Desktop Autologin
  2. Reboot so the desktop starts, then autostart can open Chromium
  3. Or on the Pi desktop itself (not SSH), run: scripts/pi-kiosk/start-online-kiosk.sh
EOF
  exit 1
}

is_paused() {
  [[ -f "$PAUSE_FILE" ]]
}

mkdir -p "$CONFIG_DIR" "$PROFILE_DIR"

# Only one online kiosk loop (desktop .desktop + labwc can both fire).
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Online kiosk already running."
  exit 0
fi

CHROMIUM="$(find_chromium || true)"
if [[ -z "$CHROMIUM" ]]; then
  echo "Chromium was not found. Install chromium or chromium-browser." >&2
  exit 1
fi

ensure_graphical_env
rm -f "$PAUSE_FILE"

OZONE_ARGS=(--ozone-platform-hint=auto)
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  OZONE_ARGS=(--ozone-platform=wayland)
elif [[ -n "${DISPLAY:-}" ]]; then
  OZONE_ARGS=(--ozone-platform=x11)
fi

if command -v xset >/dev/null 2>&1; then
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true
  xset -dpms 2>/dev/null || true
fi

echo "Opening $URL" | tee -a "$LOG_FILE"

while true; do
  if is_paused; then
    echo "Online kiosk paused ($PAUSE_FILE)."
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

  while kill -0 "$CHROMIUM_PID" 2>/dev/null; do
    if is_paused; then
      kill "$CHROMIUM_PID" 2>/dev/null || true
      wait "$CHROMIUM_PID" 2>/dev/null || true
      echo "Online kiosk stopped."
      exit 0
    fi
    sleep 0.4
  done
  wait "$CHROMIUM_PID" 2>/dev/null || true

  if is_paused; then
    echo "Online kiosk paused."
    exit 0
  fi

  sleep 3
done
