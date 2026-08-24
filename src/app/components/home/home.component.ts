import { Component, DestroyRef, HostBinding, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { PrayerTimesService } from '../../services/prayer-times.service';
import { PrayTimeTimes } from '../../lib/praytime';
import { SettingsService } from '../../services/settings.service';
import { WeatherService } from '../../services/weather.service';
import { GeoError, GeolocationService } from '../../services/geolocation.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  nextPrayerKey: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | null = null;
  nextPrayerLabel = 'PRAYER';
  nextPrayerCountdown = '';

  /** Prayer that just entered (adhan time) — shown for ~30s. */
  announcingPrayer: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | null = null;
  announcingLabel = '';
  announceLeaving = false;

  hijriDateLabel = '';
  gregDateLabel = '';

  nowHour = '';
  nowMinute = '';
  nowSeconds = '';
  nowAmPm = '';
  /** True when 12h hour is 1–9 (narrower row — clock scales up so it doesn’t look small). */
  nowSingleDigitHour = false;

  /** Combined label for accessibility (hour:minute). */
  get nowTimeLabel(): string {
    if (!this.nowHour || !this.nowMinute) return '';
    return `${this.nowHour}:${this.nowMinute}`;
  }

  sunrise: { time: string; ampm: string } | null = null;
  sunset: { time: string; ampm: string } | null = null;
  /** True while the dark night layout is active (always, or auto between sunset and sunrise). */
  @HostBinding('class.night') nightActive = false;
  /** Enables slow color fades after the first paint so load isn't animated. */
  @HostBinding('class.theme-ready') themeReady = false;
  /** Atmospheric sunrise / sunset overlay while day ↔ night fades (clock stays visible). */
  skyTransition: 'sunrise' | 'sunset' | null = null;
  /** Bright alarm-clock LED red: extra glow so it reads from across the room. */
  @HostBinding('class.clock-led')
  get clockLed(): boolean {
    return this.nightActive && this.settings.nightClockColor === 'led-red';
  }
  /** Chosen clock color for the current day/night layout. */
  @HostBinding('style.--clock-color')
  get clockColor(): string {
    return this.settingsService.clockColorHex(this.nightActive);
  }

  /**
   * Time color on dark navy cells. Night uses the same accent; day uses a
   * light mix so dark colors stay readable (white when the day color is black).
   */
  @HostBinding('style.--clock-on-dark')
  get clockOnDark(): string {
    if (this.nightActive) return this.settingsService.clockColorHex(true);
    const key = this.settings.dayClockColor ?? 'black';
    if (key === 'black') return '#ffffff';
    return `color-mix(in srgb, ${this.settingsService.clockColorHex(false)} 42%, #fff)`;
  }
  /** Current temperature in °F; null only if never fetched successfully */
  currentTempF: number | null = null;
  /** Feels-like / apparent temperature in °F */
  feelsLikeTempF: number | null = null;

  /** 'loading' while requesting location, null when idle, message when error */
  geoStatus: 'loading' | null | string = null;

  /** True while we are prompting the user to use browser geolocation */
  showGeoPrompt = false;

  times:
    | ({
        fajr: { time: string; ampm: string };
        dhuhr: { time: string; ampm: string };
        asr: { time: string; ampm: string };
        maghrib: { time: string; ampm: string };
        isha: { time: string; ampm: string };
      } & { raw: PrayTimeTimes<string> })
    | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly prayerTimes = inject(PrayerTimesService);
  private readonly settingsService = inject(SettingsService);
  private readonly weatherService = inject(WeatherService);
  private readonly geolocation = inject(GeolocationService);
  private readonly router = inject(Router);
  private settings = this.settingsService.getSettings();
  private lastDateKey = this.prayerTimes.getLocalDateKey();
  private prayerInstants: Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>> = {};
  private sunriseAtMs: number | null = null;
  private sunsetAtMs: number | null = null;
  private nextPrayerAtMs: number | null = null;
  private tomorrowFajrAtMs: number | null = null;
  private tomorrowFajrForDateKey: string | null = null;
  /** Skip the 30s “it’s time” banner on first compute / settings reload. */
  private skipNextAnnounce = true;
  private announceHoldUntilMs = 0;
  private announceClearAtMs = 0;
  private readonly announceHoldMs = 30_000;
  private readonly announceFadeMs = 800;
  private themeReadyTimer: ReturnType<typeof setTimeout> | null = null;
  private skyTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly skyTransitionMs = 30_000;
  /** Skip sky animation on the first night-mode apply (initial load / settings hydrate). */
  private nightModeInitialized = false;

  private hotCornerTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hotCornerHoldMs = 1800;
  private readonly tempCacheKey = 'weatherTemp.v2';
  /** How long a cached temp is still useful after failed refreshes (keep showing something). */
  private readonly tempCacheMaxAgeMs = 6 * 60 * 60 * 1000;
  /** How often we poll for a fresh reading (Open-Meteo is free — 10 min stays current). */
  private readonly tempRefreshMs = 10 * 60 * 1000;
  private lastTempFetchAtMs = 0;

  /** From settings: true = clock/date panel on left */
  get panelLeft(): boolean {
    return this.settings.panelLeft ?? true;
  }

  private readonly timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  private readonly gregDateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // Hijri date via Intl (Islamic calendar). Month name depends on locale data.
  private readonly hijriDateFormatter = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
    month: 'long',
    day: 'numeric',
  });

  ngOnInit(): void {
    this.updateDateLabels(new Date());

    // On first landing: prompt to use current location if coords aren't set yet.
    if (!this.settings.coords) this.showGeoPrompt = true;

    this.themeReadyTimer = setTimeout(() => {
      this.themeReady = true;
      document.documentElement.classList.add('theme-ready');
    }, 500);

    interval(1000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setNow(new Date()));

    // Recompute any time settings change (e.g. user saved new method/coords).
    this.settingsService.settings$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        this.settings = s;
        if (s.coords) this.showGeoPrompt = false;
        this.loadFromCache();
        this.loadPrayerTimes();
        this.fetchTemperature(true);
        this.updateNightMode(new Date());
      });

    this.fetchTemperature(true);
    // Rotate weather every 10 min so the reading stays fresh (free Open-Meteo path).
    interval(this.tempRefreshMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.fetchTemperature());

    // 3) Recompute when the day changes (robust for 24/7 screens)
    interval(5 * 60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshIfDateChanged());

    // 4) Also refresh when tab becomes visible or focused (covers sleep/DST/throttling)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        this.refreshIfDateChanged(true);
        this.fetchTemperatureIfStale();
      }
    };
    const onFocus = () => {
      this.refreshIfDateChanged(true);
      this.fetchTemperatureIfStale();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      this.clearHotCornerTimer();
      if (this.themeReadyTimer) clearTimeout(this.themeReadyTimer);
      if (this.skyTransitionTimer) clearTimeout(this.skyTransitionTimer);
      document.documentElement.classList.remove('theme-ready');
    });
    this.updateNightMode(new Date());
  }

  onHotCornerDown(evt?: Event): void {
    evt?.preventDefault?.();
    this.clearHotCornerTimer();
    this.hotCornerTimer = setTimeout(() => {
      void this.router.navigate(['/settings']);
    }, this.hotCornerHoldMs);
  }

  onHotCornerUp(evt?: Event): void {
    evt?.preventDefault?.();
    this.clearHotCornerTimer();
  }

  private clearHotCornerTimer(): void {
    if (this.hotCornerTimer) {
      clearTimeout(this.hotCornerTimer);
      this.hotCornerTimer = null;
    }
  }

  useMyLocation(): void {
    this.geoStatus = 'loading';
    this.geolocation.getCurrentPosition().subscribe({
      next: (pos) => {
        this.settingsService.saveSettings({
          ...this.settings,
          coords: { lat: pos.lat, lng: pos.lng },
        });
        this.geoStatus = null;
        this.showGeoPrompt = false;
      },
      error: (err: GeoError) => {
        this.geoStatus =
          err === 'permission_denied'
            ? 'Location permission denied.'
            : err === 'timeout'
              ? 'Location request timed out.'
              : err === 'unsupported'
                ? 'Geolocation is not supported.'
                : 'Could not get location.';
      },
    });
  }

  dismissGeoPrompt(): void {
    this.showGeoPrompt = false;
    if (this.geoStatus === 'loading') return;
    this.geoStatus = null;
  }

  private fetchTemperature(force = false): void {
    const coords = this.settings.coords;
    if (!coords) {
      this.currentTempF = null;
      this.feelsLikeTempF = null;
      return;
    }

    // Show last known temp immediately so the strip never blanks on a blip.
    if (this.currentTempF === null) {
      const cached = this.readCachedTemp(coords);
      if (cached) {
        this.currentTempF = cached.temp;
        this.feelsLikeTempF = cached.feelsLike;
      }
    }

    // Skip if we just fetched (e.g. focus storms), unless forced.
    if (!force && this.lastTempFetchAtMs && Date.now() - this.lastTempFetchAtMs < this.tempRefreshMs / 2) {
      return;
    }
    this.lastTempFetchAtMs = Date.now();

    this.weatherService.getCurrentWeather(coords.lat, coords.lng).subscribe({
      next: (reading) => {
        this.currentTempF = reading.tempF;
        this.feelsLikeTempF = reading.feelsLikeF;
        this.writeCachedTemp(coords, reading.tempF, reading.feelsLikeF);
      },
      error: () => {
        // Keep showing last known value (in-memory or localStorage). Never clear to "--".
        if (this.currentTempF === null) {
          const cached = this.readCachedTemp(coords);
          if (cached) {
            this.currentTempF = cached.temp;
            this.feelsLikeTempF = cached.feelsLike;
          }
        }
      },
    });
  }

  /** After sleep / tab hide, pull a fresh reading if the last one is getting old. */
  private fetchTemperatureIfStale(): void {
    if (!this.lastTempFetchAtMs || Date.now() - this.lastTempFetchAtMs >= this.tempRefreshMs) {
      this.fetchTemperature(true);
    }
  }

  private readCachedTemp(
    coords: { lat: number; lng: number }
  ): { temp: number; feelsLike: number | null } | null {
    try {
      const raw = localStorage.getItem(this.tempCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        temp?: number;
        feelsLike?: number | null;
        lat?: number;
        lng?: number;
        fetchedAt?: number;
      };
      if (typeof parsed.temp !== 'number' || Number.isNaN(parsed.temp)) return null;
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
      if (typeof parsed.fetchedAt !== 'number') return null;
      // Same location (within ~0.01°) and not too stale
      if (Math.abs(parsed.lat - coords.lat) > 0.01 || Math.abs(parsed.lng - coords.lng) > 0.01) {
        return null;
      }
      if (Date.now() - parsed.fetchedAt > this.tempCacheMaxAgeMs) return null;
      const feelsLike =
        typeof parsed.feelsLike === 'number' && !Number.isNaN(parsed.feelsLike)
          ? parsed.feelsLike
          : null;
      return { temp: parsed.temp, feelsLike };
    } catch {
      return null;
    }
  }

  private writeCachedTemp(
    coords: { lat: number; lng: number },
    temp: number,
    feelsLike: number | null
  ): void {
    try {
      localStorage.setItem(
        this.tempCacheKey,
        JSON.stringify({
          temp,
          feelsLike,
          lat: coords.lat,
          lng: coords.lng,
          fetchedAt: Date.now(),
        })
      );
    } catch {
      // ignore storage failures
    }
  }

  private refreshIfDateChanged(force = false): void {
    const currentKey = this.prayerTimes.getLocalDateKey();
    if (!force && currentKey === this.lastDateKey) return;
    if (currentKey !== this.lastDateKey) {
      this.lastDateKey = currentKey;
      this.updateDateLabels(new Date());
    }
    this.loadPrayerTimes();
  }

  private loadFromCache(): void {
    const cached = this.prayerTimes.getCachedTodayTimes(this.settings);
    if (!cached) return;
    this.applyTimes(cached.times);
  }

  private loadPrayerTimes(): void {
    // Primary: use configured coords from /settings.
    if (this.settings.coords) {
      const { times: raw } = this.prayerTimes.computeAndCacheTodayTimes(this.settings);
      this.applyTimes(raw);
      return;
    }
    // No geolocation fallback: this app must run without permission prompts (e.g. Raspberry Pi kiosk).
    this.sunriseAtMs = null;
    this.sunsetAtMs = null;
    this.settingsService.setSunTimes(null, null);
    this.updateNightMode(new Date());
  }

  private applyTimes(raw: PrayTimeTimes<string>): void {
    const sunrise = this.splitTime(raw.sunrise);
    const sunset = this.splitTime(raw.sunset);
    const today = new Date();

    this.sunrise = sunrise;
    this.sunset = sunset;
    this.sunriseAtMs = this.parseTimeToEpoch(raw.sunrise, today);
    this.sunsetAtMs = this.parseTimeToEpoch(raw.sunset, today);
    this.settingsService.setSunTimes(this.sunriseAtMs, this.sunsetAtMs);

    this.times = {
      fajr: this.splitTime(raw.fajr),
      dhuhr: this.splitTime(raw.dhuhr),
      asr: this.splitTime(raw.asr),
      maghrib: this.splitTime(raw.maghrib),
      isha: this.splitTime(raw.isha),
      raw,
    };

    // Pre-compute today's prayer instants for fast "next prayer" lookup.
    this.prayerInstants = {
      fajr: this.parseTimeToEpoch(raw.fajr, today) ?? undefined,
      dhuhr: this.parseTimeToEpoch(raw.dhuhr, today) ?? undefined,
      asr: this.parseTimeToEpoch(raw.asr, today) ?? undefined,
      maghrib: this.parseTimeToEpoch(raw.maghrib, today) ?? undefined,
      isha: this.parseTimeToEpoch(raw.isha, today) ?? undefined,
    };
    this.tomorrowFajrAtMs = null;
    this.tomorrowFajrForDateKey = null;
    this.skipNextAnnounce = true;
    this.updateNextPrayer(today);
    this.updateNightMode(today);
  }

  private splitTime(value: string): { time: string; ampm: string } {
    // Expect formats like "5:27 AM"
    const match = value.trim().match(/^(.+?)\s*([AP]M)$/i);
    if (!match) return { time: value, ampm: '' };
    return { time: match[1], ampm: match[2].toUpperCase() };
  }

  private parseTimeToEpoch(value: string, baseDate: Date): number | null {
    // Expects formats like "5:27 AM" (from PrayTime formatting).
    const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return null;

    const hour12 = Number(match[1]);
    const minute = Number(match[2]);
    const ampm = match[3].toUpperCase();

    let hour24 = hour12 % 12;
    if (ampm === 'PM') hour24 += 12;

    const dt = new Date(baseDate);
    dt.setHours(hour24, minute, 0, 0);
    return dt.getTime();
  }

  private updateNextPrayer(now: Date): void {
    const order: Array<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'> = [
      'fajr',
      'dhuhr',
      'asr',
      'maghrib',
      'isha',
    ];

    const prevKey = this.nextPrayerKey;
    const nowMs = now.getTime();
    let nextKey: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' = 'fajr';
    let nextAt: number | null = null;

    for (const key of order) {
      const t = this.prayerInstants[key];
      if (typeof t === 'number' && nowMs < t) {
        nextKey = key;
        nextAt = t;
        break;
      }
    }

    if (nextAt == null) {
      // After Isha, next is Fajr tomorrow.
      nextKey = 'fajr';
      if (!this.settings.coords) {
        nextAt = null;
      } else {
        const todayKey = this.prayerTimes.getLocalDateKey(now);
        if (this.tomorrowFajrForDateKey !== todayKey) {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowTimes = this.prayerTimes.computeTimes(this.settings, tomorrow);
          this.tomorrowFajrAtMs = this.parseTimeToEpoch(tomorrowTimes.fajr, tomorrow);
          this.tomorrowFajrForDateKey = todayKey;
        }
        nextAt = this.tomorrowFajrAtMs;
      }
    }

    this.nextPrayerKey = nextKey;
    this.nextPrayerAtMs = nextAt;
    this.nextPrayerLabel = nextKey.toUpperCase();

    if (this.skipNextAnnounce) {
      this.skipNextAnnounce = false;
      return;
    }
    if (prevKey && prevKey !== nextKey) {
      this.startPrayerAnnounce(prevKey, nowMs);
    }
  }

  private startPrayerAnnounce(
    prayer: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha',
    nowMs: number
  ): void {
    this.announcingPrayer = prayer;
    this.announcingLabel = prayer.toUpperCase();
    this.announceLeaving = false;
    this.announceHoldUntilMs = nowMs + this.announceHoldMs;
    this.announceClearAtMs = this.announceHoldUntilMs + this.announceFadeMs;
  }

  private tickPrayerAnnounce(nowMs: number): void {
    if (!this.announcingPrayer) return;
    if (nowMs >= this.announceClearAtMs) {
      this.announcingPrayer = null;
      this.announcingLabel = '';
      this.announceLeaving = false;
      return;
    }
    if (nowMs >= this.announceHoldUntilMs) {
      this.announceLeaving = true;
    }
  }

  private updateCountdown(now: Date): void {
    if (!this.nextPrayerAtMs || !this.nextPrayerKey) {
      this.nextPrayerCountdown = '';
      return;
    }

    let diff = Math.max(0, this.nextPrayerAtMs - now.getTime());
    const totalSeconds = Math.floor(diff / 1000);
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;

    this.nextPrayerCountdown = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  private updateDateLabels(date: Date): void {
    // Gregorian label like: "SUNDAY, DEC 8"
    const gParts = this.gregDateFormatter.formatToParts(date);
    const weekday = gParts.find((p) => p.type === 'weekday')?.value ?? '';
    const month = gParts.find((p) => p.type === 'month')?.value ?? '';
    const day = gParts.find((p) => p.type === 'day')?.value ?? '';
    this.gregDateLabel = `${weekday.toUpperCase()}, ${month.toUpperCase()} ${day}`;

    // Hijri label like: "RABIʻ AL-THANI 11" (varies by locale/calendar data)
    const hParts = this.hijriDateFormatter.formatToParts(date);
    const hMonth = (hParts.find((p) => p.type === 'month')?.value ?? '').replace(/[-]/g, ' ');
    const hDay = hParts.find((p) => p.type === 'day')?.value ?? '';
    this.hijriDateLabel = `${hMonth.toUpperCase()} ${hDay}`.trim();
  }

  private setNow(date: Date): void {
    const parts = this.timeFormatter.formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
    const second = parts.find((p) => p.type === 'second')?.value ?? '';
    const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';

    this.nowHour = hour;
    this.nowMinute = minute;
    this.nowSeconds = second;
    this.nowAmPm = dayPeriod;
    const hourNum = parseInt(hour, 10);
    this.nowSingleDigitHour = hourNum >= 1 && hourNum <= 9;

    // Ensure date/prayer-times switch over immediately at midnight.
    const currentKey = this.prayerTimes.getLocalDateKey(date);
    if (currentKey !== this.lastDateKey) {
      this.lastDateKey = currentKey;
      this.updateDateLabels(date);
      this.loadPrayerTimes();
      return;
    }

    // Update next-prayer highlight as time passes.
    if (this.times?.raw) this.updateNextPrayer(date);
    this.updateCountdown(date);
    this.tickPrayerAnnounce(date.getTime());
    this.updateNightMode(date);
  }

  /**
   * Apply the saved Night mode setting:
   * - off  → always the normal light layout
   * - on   → always the dark night layout
   * - auto → dark from sunset until sunrise (falls back to 8pm–6am if times aren't ready)
   *
   * When auto flips at sunrise/sunset (or the user toggles), run a 30s sky overlay
   * so the fade feels like sunrise or sunset while the clock stays readable.
   */
  private updateNightMode(now: Date): void {
    const active = this.settingsService.isNightActive(now);
    if (this.nightModeInitialized && active !== this.nightActive) {
      this.startSkyTransition(active ? 'sunset' : 'sunrise');
    }
    this.nightModeInitialized = true;
    this.nightActive = active;
    document.documentElement.classList.toggle('night', active);
  }

  private startSkyTransition(kind: 'sunrise' | 'sunset'): void {
    if (this.skyTransitionTimer) clearTimeout(this.skyTransitionTimer);
    this.skyTransition = kind;
    this.skyTransitionTimer = setTimeout(() => {
      this.skyTransition = null;
      this.skyTransitionTimer = null;
    }, this.skyTransitionMs);
  }
}

