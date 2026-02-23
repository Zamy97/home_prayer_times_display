# Prayer Times Display

An Angular 17 single-page application that shows **Islamic prayer times**, a **live clock**, **countdown to the next prayer**, and **sunrise/sunset** on a full-screen display. Designed for **kiosk use** (Raspberry Pi, laptop, monitor, or TV)—no mobile layout; desktop-only.

---

## Features

### Home screen (`/`)

- **Prayer times grid**  
  Five daily prayers with start times in 12-hour format (AM/PM):
  - **Fajr** (with “STARTS” label)
  - **Dhuhr**
  - **Asr**
  - **Maghrib**
  - **Isha**

- **Next-prayer highlight**  
  The row of the *next* prayer is visually highlighted (light background, dark text). When Fajr is next, the “STARTS” label has a distinct background.

- **Live clock**  
  Current time with seconds and AM/PM, updated every second.

- **Countdown**  
  “NEXT [FAJR|DHUHR|ASR|MAGHRIB|ISHA] IN HH:MM:SS” until the next prayer. After Isha, countdown is to tomorrow’s Fajr.

- **Dual dates**  
  - **Hijri** (Islamic calendar), e.g. “RABIʻ AL-THANI 11”
  - **Gregorian**, e.g. “SUNDAY, DEC 8”

- **Jumu'ah**  
  Fixed display: 1:00 PM (STARTS) and 1:30 PM (JUMU'AH).

- **Sunrise & sunset**  
  Computed from the same location and shown with icons in a bar at the bottom of the panel.

- **Layout toggle**  
  Settings let you choose:
  - **Clock & date on left** — prayer grid on the right
  - **Clock & date on right** — prayer grid on the left  

  Same two-column layout; only the order of the columns changes.

- **Kiosk entry to settings**  
  A **hot corner** (top-right, 160×160 px) is invisible. **Press and hold** for ~1.8 seconds to open `/settings` without a visible button, so the main screen stays clean.

- **No geolocation**  
  Location is **only** set via Settings (lat/lng). No browser geolocation prompts, so it runs reliably on headless or kiosk devices.

- **Automatic refresh**  
  - Prayer times recompute when the calendar day changes (and every 5 minutes as a safeguard).
  - When the tab becomes visible or the window gains focus, times refresh (covers sleep, DST, or long idle).
  - When settings change (e.g. new location or method), times recompute immediately.

- **Caching**  
  Today’s prayer times are cached in `localStorage` by date and settings (coords, method, asr, timezone). Cache is reused until date or settings change.

---

## Settings (`/settings`)

- **Latitude / Longitude**  
  Required for prayer times. Default is a fixed coordinate (ZIP 48015) so the app works out of the box.

- **Calculation method**  
  Dropdown: ISNA (North America), MWL, Egypt, Makkah, Karachi, Singapore, France, Russia, Tehran, Jafari. Default: **ISNA**.

- **Asr**  
  **Hanafi** or **Standard**. Default: **Hanafi**.

- **Timezone**  
  Read-only; uses the device timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

- **Layout**  
  “Clock & date on left” or “Clock & date on right” (see above).

- **Save**  
  Persists to `localStorage` and navigates back to `/`.

---

## Tech stack

- **Angular 17** (NgModule, not standalone)
- **Routing:** `''` and `home` → Home, `settings` → Settings, `setup` → redirect to Settings (no URL-based setup), `**` → Home
- **State:** No backend. Settings and prayer-times cache live in **localStorage**.
- **Prayer math:** Embedded **PrayTime** algorithm (TypeScript port of [praytimes.org](https://praytimes.org) v3.2, MIT). All calculations run in the browser; no external prayer-time API.

---

## Project structure

```
src/
  app/
    app.component.ts          # Root; title "Prayer Times"; <router-outlet>
    app.module.ts             # Declares Home, Settings; imports Router, Forms, HttpClient
    app-routing.module.ts     # Routes: '', home, settings, setup→settings, **
    components/
      home/
        home.component.ts     # Clock, prayer grid, countdown, dates, sunrise/sunset, hot corner
        home.component.html  # Two-column layout; grid + panel (dates, clock, countdown, Jumu'ah, sun bar)
      settings/
        settings.component.ts # Form: lat, lng, method, asr, timezone, layout; save
        settings.component.html
    lib/
      praytime.ts            # PrayTime class: methods (ISNA, MWL, …), asr (Hanafi/Standard), location, timezone, times(date)
    services/
      settings.service.ts    # BehaviorSubject<PrayerSettings>; load/save localStorage; key prayerSettings.v1
      prayer-times.service.ts # getCachedTodayTimes, computeAndCacheTodayTimes; cache key prayerTimes.v3
  home-screen.css             # All home-screen styles (scoped to app-home); two-column grid; hot corner; no mobile breakpoints
  styles.css                  # Global styles; @import home-screen.css
  index.html
```

- **Styles:** Home screen CSS is in `src/home-screen.css`, imported from `src/styles.css`, to stay under Angular’s component style budget. `home.component.css` only contains a short note.
- **Assets:** Bootstrap is still referenced in `angular.json` (legacy); the UI is custom CSS in `home-screen.css` and settings component CSS.

---

## Configuration

- **Default settings** (see `settings.service.ts`):  
  `coords` = fixed default (ZIP 48015), `method` = ISNA, `asr` = Hanafi, `timezone` = device, `panelLeft` = true.
- **Storage keys:** `prayerSettings.v1`, `prayerTimes.v3`. Bumping the suffix invalidates old caches.

---

## Build & run

- **Develop:** `ng serve` (default port 4200). Use `ng serve --port 8081` if you prefer 8081.
- **Production build:** `ng build`
- **Output:** `dist/home-prayer-times-display/browser` (used by Vercel config below).

---

## Deployment (Vercel)

- **vercel.json**  
  - `buildCommand`: `npm run build`  
  - `outputDirectory`: `dist/home-prayer-times-display/browser`  
  - `rewrites`: all routes `/(.*)` → `/index.html` for client-side routing.

Deploy with Vercel; the SPA will serve correctly.

---

## Summary

| Item | Detail |
|------|--------|
| **Purpose** | Full-screen prayer times + clock for kiosks (Pi, laptop, monitor, TV) |
| **Prayer source** | Client-side PrayTime (praytimes.org); no API calls |
| **Location** | Manual only (Settings); no geolocation |
| **Persistence** | localStorage (settings + daily prayer cache) |
| **Layout** | Two columns; optional swap (clock/date left or right) |
| **Kiosk entry** | Hot corner (hold ~1.8 s) → Settings |
