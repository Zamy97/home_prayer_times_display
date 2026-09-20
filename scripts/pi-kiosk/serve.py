#!/usr/bin/env python3
"""Serve the built Angular app locally with SPA routing and no dependencies."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def pause_file_path() -> Path:
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config / "prayer-times-kiosk" / "paused"


def request_kiosk_stop() -> None:
    """Ask start-kiosk.sh to exit and close Chromium (for Wi-Fi / desktop)."""
    pause = pause_file_path()
    pause.parent.mkdir(parents=True, exist_ok=True)
    pause.write_text("1\n", encoding="utf-8")
    # Best-effort: stop Chromium quickly; start-kiosk watches the pause file too.
    subprocess.run(
        ["pkill", "-f", "prayer-times-kiosk/chromium"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(
        ["pkill", "-f", "chromium.*--kiosk"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(
        ["pkill", "-f", "chromium-browser.*--kiosk"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class KioskHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method name
        path = urlsplit(self.path).path

        # Weather cannot refresh offline. Fail quickly so the Angular app can
        # retain its cached value or display "--" without a long timeout.
        if path.startswith("/api/weather"):
            payload = json.dumps({"error": "Weather unavailable offline"}).encode()
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        # Leave kiosk for Pi desktop / Wi-Fi (used by Settings → Exit to desktop).
        if path in ("/__stop-kiosk", "/api/stop-kiosk"):
            request_kiosk_stop()
            payload = json.dumps(
                {"ok": True, "message": "Kiosk stopping — use the desktop Wi-Fi menu."}
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        requested = Path(self.directory, path.lstrip("/"))
        if path != "/" and not requested.is_file():
            self.path = "/index.html"

        super().do_GET()

    def log_message(self, message: str, *args: object) -> None:
        print(f"[kiosk] {self.address_string()} {message % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    directory = os.path.abspath(args.directory)
    index = os.path.join(directory, "index.html")
    if not os.path.isfile(index):
        raise SystemExit(f"Offline build not found: {index}\nRun npm run kiosk:build first.")

    handler = lambda *handler_args, **kwargs: KioskHandler(  # noqa: E731
        *handler_args, directory=directory, **kwargs
    )
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Prayer Times kiosk serving http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
