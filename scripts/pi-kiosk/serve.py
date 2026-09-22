#!/usr/bin/env python3
"""Serve the built Angular app locally with SPA routing and no dependencies."""

from __future__ import annotations

import argparse
import calendar as calmod
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

CHC_HIJRI_URL = "https://hilalcommittee.org/api/HijriDates"
HIJRI_CACHE_MAX_AGE_S = 6 * 60 * 60
MONTH_NAMES = [
    "Muharram",
    "Safar",
    "Rabi al-Awwal",
    "Rabi al-Thani",
    "Jumada al-Ula",
    "Jumada al-Akhirah",
    "Rajab",
    "Sha'ban",
    "Ramadan",
    "Shawwal",
    "Dhul Qi'dah",
    "Dhul Hijjah",
]


def pause_file_path() -> Path:
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config / "prayer-times-kiosk" / "paused"


def hijri_cache_path() -> Path:
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config / "prayer-times-kiosk" / "hijri-calendar.json"


def request_kiosk_stop() -> None:
    """Ask start-kiosk.sh to exit and close Chromium (for Wi-Fi / desktop)."""
    pause = pause_file_path()
    pause.parent.mkdir(parents=True, exist_ok=True)
    pause.write_text("1\n", encoding="utf-8")
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


def _days_in_months(num_of_days: dict | None) -> list[int]:
    out: list[int] = []
    for i in range(1, 13):
        n = int((num_of_days or {}).get(f"NumDaysMonth{i}") or 30)
        out.append(n if n in (29, 30) else 30)
    return out


def _parse_ymd(raw: str) -> tuple[int, int, int] | None:
    text = str(raw or "")[:10]
    if len(text) != 10 or text[4] != "-" or text[7] != "-":
        return None
    try:
        return int(text[0:4]), int(text[5:7]), int(text[8:10])
    except ValueError:
        return None


def _to_ordinal(y: int, m: int, d: int) -> int:
    """UTC day ordinal — matches Angular / Vercel api/hijri.js Date.UTC math."""
    return calmod.timegm((y, m, d, 0, 0, 0, 0, 0, 0)) // 86400


def _compute_today(calendar: dict) -> dict | None:
    first = _parse_ymd(str(calendar.get("FirstDay") or ""))
    year = calendar.get("HijriYear")
    if not first or not year:
        return None
    days = _days_in_months(calendar.get("NumOfDays"))
    now = time.localtime()
    target = _to_ordinal(now.tm_year, now.tm_mon, now.tm_mday)
    cursor = _to_ordinal(*first)
    for i, length in enumerate(days):
        end = cursor + length - 1
        if cursor <= target <= end:
            day = target - cursor + 1
            month_name = MONTH_NAMES[i]
            return {
                "day": day,
                "monthIndex": i + 1,
                "monthName": month_name,
                "year": year,
                "label": f"{month_name.upper()} {day}",
            }
        cursor = end + 1
    return None


def _payload_from_chc(calendar: dict, source: str) -> dict:
    today = _compute_today(calendar)
    return {
        "source": source,
        "today": today,
        "calendar": {
            "hijriYear": calendar.get("HijriYear"),
            "firstDay": str(calendar.get("FirstDay") or "")[:10],
            "daysInMonths": _days_in_months(calendar.get("NumOfDays")),
        },
    }


def _read_hijri_disk_cache() -> tuple[dict | None, float | None]:
    path = hijri_cache_path()
    if not path.is_file():
        return None, None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        fetched_at = float(data.get("fetchedAt") or 0)
        calendar = data.get("chc")
        if not isinstance(calendar, dict):
            return None, None
        return calendar, fetched_at
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None, None


def _write_hijri_disk_cache(calendar: dict) -> None:
    path = hijri_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"fetchedAt": time.time(), "chc": calendar}),
        encoding="utf-8",
    )


def _fetch_chc_calendar(timeout_s: float = 8.0) -> dict:
    req = urllib.request.Request(
        CHC_HIJRI_URL,
        headers={"Accept": "application/json", "User-Agent": "HomePrayerTimesKiosk/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_hijri_response() -> tuple[int, dict]:
    """Match online /api/hijri: prefer live CHC, else disk cache, else 503."""
    cached, fetched_at = _read_hijri_disk_cache()
    fresh = fetched_at is not None and (time.time() - fetched_at) < HIJRI_CACHE_MAX_AGE_S

    if cached and fresh:
        return 200, _payload_from_chc(cached, "chc-cache")

    try:
        live = _fetch_chc_calendar()
        _write_hijri_disk_cache(live)
        return 200, _payload_from_chc(live, "chc-api")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError):
        if cached:
            return 200, _payload_from_chc(cached, "chc-cache-stale")
        return 503, {"error": "Hijri date unavailable offline"}


class KioskHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method name
        path = urlsplit(self.path).path

        if path.startswith("/api/weather"):
            payload = json.dumps({"error": "Weather unavailable offline"}).encode()
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if path.startswith("/api/hijri"):
            status, body = build_hijri_response()
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

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
