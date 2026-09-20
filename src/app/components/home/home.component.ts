import { Component, ChangeDetectorRef, DestroyRef, HostBinding, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { interval, startWith, take } from 'rxjs';
import { PrayerTimesService } from '../../services/prayer-times.service';
import { PrayTimeTimes } from '../../lib/praytime';
import { SettingsService } from '../../services/settings.service';
import { WeatherService } from '../../services/weather.service';
import { HijriDateService } from '../../services/hijri-date.service';
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

  nowTime = '';
  nowSeconds = '';
  nowAmPm = '';
  /** True when 12h hour is 1–9 (narrower row — clock scales up so it doesn’t look small). */
  nowSingleDigitHour = false;

  sunrise: { time: string; ampm: string } | null = null;
  sunset: { time: string; ampm: string } | null = null;
  private tomorrowFajr: { time: string; ampm: string } | null = null;
  private tomorrowSunrise: { time: string; ampm: string } | null = null;
  /** Hours:minutes remaining until sunrise (only after Fajr + 15 minutes). */
  sunriseCountdown = '';
  /**
   * True once we are 15 minutes past the sleep-session Fajr — then the left
   * card switches from Fajr start to the until-sunrise countdown.
   */
  sleepShowSunriseCountdown = false;
  get sleepFajr(): { time: string; ampm: string } | null {
    const now = Date.now();
    // Until sunrise, keep showing today's Fajr (before or after it starts).
    if (this.sunriseAtMs != null && now < this.sunriseAtMs) {
      return this.times?.fajr ?? null;
    }
    // Evening Sleep window: show tomorrow morning's Fajr.
    return this.tomorrowFajr ?? (this.forceSleepPreview ? this.times?.fajr ?? null : null);
  }
  get sleepSunrise(): { time: string; ampm: string } | null {
    const now = Date.now();
    // Until sunrise, keep showing today's sunrise time.
    if (this.sunriseAtMs != null && now < this.sunriseAtMs) {
      return this.sunrise;
    }
    // Evening Sleep window: show tomorrow's sunrise.
    return this.tomorrowSunrise ?? (this.forceSleepPreview ? this.sunrise : null);
  }
  /** True while the dark night layout is active (always, or auto between sunset and sunrise). */
  nightActive = false;
  /** Sparse Sleep / Always simple layout is showing. */
  sleepModeActive = false;
  /**
   * True when using classic overnight Sleep cards (Fajr / sunrise countdown),
   * not the all-day next/following prayer cards.
   */
  sleepOvernightCards = false;
  /** Always-simple left card: upcoming prayer (or event). */
  simpleLeft: { label: string; time: string; ampm: string } | null = null;
  /** Always-simple right card: following prayer / sunset / etc. */
  simpleRight: { label: string; time: string; ampm: string } | null = null;
  /**
   * Classical prohibited-prayer window is active (sunrise / zawal / pre-Maghrib).
   * UI swaps countdown + Jumu'ah for a large message when showPrayerBan is true.
   */
  prayerBanActive = false;
  /** Secondary line, e.g. "UNTIL 7:32 AM" or "UNTIL DHUHR". */
  prayerBanUntilLabel = '';
  /** Ban panel on the full prayer-grid layout (not while simple layout is active). */
  get showPrayerBan(): boolean {
    return (
      this.prayerBanActive &&
      !this.sleepModeActive &&
      this.announcingPrayer == null &&
      this.settings.prayerBanAlert !== false
    );
  }
  /** Ban message inside the sparse Sleep / Always layout. */
  get showSleepPrayerBan(): boolean {
    return (
      this.sleepModeActive &&
      this.prayerBanActive &&
      this.announcingPrayer == null &&
      this.settings.prayerBanAlert !== false
    );
  }
  @HostBinding('class.night')
  get nightLayoutClass(): boolean {
    return this.simpleLayoutUsesDarkTheme;
  }
  @HostBinding('class.sleep-mode')
  get sleepModeClass(): boolean {
    return this.sleepModeActive;
  }
  /**
   * Dark chrome for the sparse layout / night grid.
   * Always-simple stays light from sunrise→sunset, then uses night colors.
   * Classic Sleep-only overnight is always dark while active.
   */
  get simpleLayoutUsesDarkTheme(): boolean {
    if (this.sleepModeActive) {
      if (this.sleepOvernightCards) return true;
      // Always mode: follow the sun, not the Night mode toggle.
      return !this.settingsService.isDaytimeBySun();
    }
    return this.nightActive;
  }
  /** Enables slow color fades after the first paint so load isn't animated. */
  @HostBinding('class.theme-ready') themeReady = false;
  /** Atmospheric sunrise / sunset overlay while day ↔ night fades (clock stays visible). */
  skyTransition: 'sunrise' | 'sunset' | null = null;
  /** Stacked portrait layout (setting or auto orientation). */
  portraitLayout = false;
  @HostBinding('class.layout-portrait')
  get layoutPortrait(): boolean {
    return this.portraitLayout;
  }
  /** Full-screen prayer announce is active — suppress duplicate highlights under the overlay. */
  @HostBinding('class.is-announcing')
  get isAnnouncing(): boolean {
    return this.announcingPrayer !== null;
  }
  /** Bright alarm-clock LED red: extra glow so it reads from across the room. */
  @HostBinding('class.clock-led')
  get clockLed(): boolean {
    if (!this.simpleLayoutUsesDarkTheme) return false;
    return this.settings.nightClockColor === 'led-red';
  }
  /** User-controlled size multipliers for the clock panel (from settings). */
  @HostBinding('style.--scale-date')
  get scaleDate(): string {
    return String(this.settings.clockPanelScale?.date ?? 1);
  }

  @HostBinding('style.--scale-temp')
  get scaleTemp(): string {
    return String(this.settings.clockPanelScale?.temp ?? 1);
  }

  @HostBinding('style.--scale-clock')
  get scaleClock(): string {
    return String(this.settings.clockPanelScale?.clock ?? 1);
  }

  @HostBinding('style.--scale-clock-double')
  get scaleClockDouble(): string {
    return String(this.settings.clockPanelScale?.clockDouble ?? this.settings.clockPanelScale?.clock ?? 1);
  }

  @HostBinding('style.--scale-countdown')
  get scaleCountdown(): string {
    return String(this.settings.clockPanelScale?.countdown ?? 1);
  }

  @HostBinding('style.--scale-sun')
  get scaleSun(): string {
    return String(this.settings.clockPanelScale?.sun ?? 1);
  }

  @HostBinding('style.--scale-sleep-clock')
  get scaleSleepClock(): string {
    return String(this.settings.sleepModeScale?.clock ?? 1);
  }

  @HostBinding('style.--scale-sleep-clock-double')
  get scaleSleepClockDouble(): string {
    return String(this.settings.sleepModeScale?.clockDouble ?? 1);
  }

  @HostBinding('style.--scale-sleep-facts')
  get scaleSleepFacts(): string {
    return String(this.settings.sleepModeScale?.facts ?? 1);
  }

  @HostBinding('style.--scale-sleep-labels')
  get scaleSleepLabels(): string {
    return String(this.settings.sleepModeScale?.labels ?? 1);
  }

  @HostBinding('style.--scale-prayer-name')
  get scalePrayerName(): string {
    return String(this.settings.prayerPanelScale?.names ?? 1);
  }

  @HostBinding('style.--scale-prayer-time')
  get scalePrayerTime(): string {
    return String(this.settings.prayerPanelScale?.times ?? 1);
  }

  @HostBinding('style.--scale-prayer-label')
  get scalePrayerLabel(): string {
    return String(this.settings.prayerPanelScale?.labels ?? 1);
  }
  /** Chosen clock color for the current day / night / simple layout. */
  @HostBinding('style.--clock-color')
  get clockColor(): string {
    if (this.sleepModeActive) {
      return this.settingsService.clockColorHex(
        this.simpleLayoutUsesDarkTheme,
        this.displayHour
      );
    }
    return this.settingsService.clockColorHex(this.nightActive, this.displayHour);
  }

  @HostBinding('style.--board-bg')
  get boardBackground(): string {
    return this.settingsService.boardBackgroundHex(this.simpleLayoutUsesDarkTheme);
  }

  /**
   * Time color on dark navy cells. Night uses the night accent; day uses a
   * light mix so dark colors stay readable (white when the day color is black).
   */
  @HostBinding('style.--clock-on-dark')
  get clockOnDark(): string {
    if (this.sleepModeActive) {
      return this.settingsService.clockOnDarkHex(
        this.simpleLayoutUsesDarkTheme,
        this.displayHour
      );
    }
    return this.settingsService.clockOnDarkHex(this.nightActive, this.displayHour);
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
  private readonly hijriDate = inject(HijriDateService);
  private readonly geolocation = inject(GeolocationService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  settings = this.settingsService.getSettings();
  /** Local hour used for hourly color rotation (updated each tick). */
  displayHour = new Date().getHours();
  private lastDateKey = this.prayerTimes.getLocalDateKey();
  private prayerInstants: Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>> = {};
  private sunriseAtMs: number | null = null;
  private sunsetAtMs: number | null = null;
  private nextPrayerAtMs: number | null = null;
  private tomorrowFajrAtMs: number | null = null;
  private tomorrowSunriseAtMs: number | null = null;
  private tomorrowFajrForDateKey: string | null = null;
  private readonly sunriseBanMs = 15 * 60 * 1000;
  private readonly zawalBeforeDhuhrMs = 10 * 60 * 1000;
  private readonly maghribBanMs = 15 * 60 * 1000;
  /** Delay after Fajr before Sleep mode switches to the until-sunrise countdown. */
  private readonly sleepCountdownAfterFajrMs = 15 * 60 * 1000;
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
  /** Settings sizing iframe can force Sleep mode regardless of current time. */
  private readonly forceSleepPreview =
    new URLSearchParams(window.location.search).get('sleepPreview') === '1';

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

  private readonly portraitMediaQuery = window.matchMedia('(orientation: portrait)');
  private readonly onPortraitMediaChange = (): void => this.updateScreenLayout();

  ngOnInit(): void {
    this.updateDateLabels(new Date());
    this.hijriDate
      .ensureCalendar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateDateLabels(new Date());
        this.cdr.detectChanges();
      });

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
        const prev = this.settings;
        this.settings = s;
        if (s.coords) this.showGeoPrompt = false;

        const prayerInputsChanged =
          prev.coords !== s.coords ||
          prev.method !== s.method ||
          prev.asr !== s.asr ||
          prev.fajrAngle !== s.fajrAngle ||
          prev.ishaAngle !== s.ishaAngle ||
          prev.timezone !== s.timezone;

        if (prayerInputsChanged) {
          this.loadFromCache();
          this.loadPrayerTimes();
          this.fetchTemperature(true);
        }

        this.updateNightMode(new Date());
        this.updateScreenLayout();
        this.cdr.detectChanges();
      });

    this.portraitMediaQuery.addEventListener('change', this.onPortraitMediaChange);
    this.updateScreenLayout();

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
      this.portraitMediaQuery.removeEventListener('change', this.onPortraitMediaChange);
      this.clearHotCornerTimer();
      if (this.themeReadyTimer) clearTimeout(this.themeReadyTimer);
      if (this.skyTransitionTimer) clearTimeout(this.skyTransitionTimer);
      document.documentElement.classList.remove('theme-ready');
    });

    this.loadFromCache();
    this.loadPrayerTimes();
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
    this.settingsService.setSleepIshaAtMs(null);
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
    this.settingsService.setSleepIshaAtMs(this.prayerInstants.isha ?? null);
    this.tomorrowFajrAtMs = null;
    this.tomorrowSunriseAtMs = null;
    this.tomorrowFajr = null;
    this.tomorrowSunrise = null;
    this.tomorrowFajrForDateKey = null;
    this.skipNextAnnounce = true;
    this.updateNextPrayer(today);
    this.updateNightMode(today);
    this.updatePrayerBan(today);
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
          this.tomorrowSunriseAtMs = this.parseTimeToEpoch(tomorrowTimes.sunrise, tomorrow);
          this.tomorrowFajr = this.splitTime(tomorrowTimes.fajr);
          this.tomorrowSunrise = this.splitTime(tomorrowTimes.sunrise);
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

    // Prefer CHC moonsighting calendar (https://hilalcommittee.org/); Intl is fallback.
    this.hijriDateLabel = this.hijriDate.formatForDate(date).label;
  }

  private setNow(date: Date): void {
    const hour = date.getHours();
    if (hour !== this.displayHour) {
      this.displayHour = hour;
    }

    const currentKey = this.prayerTimes.getLocalDateKey(date);
    if (currentKey !== this.lastDateKey) {
      this.lastDateKey = currentKey;
      this.hijriDate.refresh().pipe(take(1)).subscribe(() => {
        this.updateDateLabels(date);
        this.cdr.detectChanges();
      });
      this.updateDateLabels(date);
      this.loadPrayerTimes();
      this.updateClockFromDate(date);
      return;
    }

    this.updateClockFromDate(date);

    // Update next-prayer highlight as time passes.
    if (this.times?.raw) this.updateNextPrayer(date);
    this.updateCountdown(date);
    this.tickPrayerAnnounce(date.getTime());
    this.updateNightMode(date);
    this.updatePrayerBan(date);
  }

  private updateClockFromDate(date: Date): void {
    const parts = this.timeFormatter.formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
    const second = parts.find((p) => p.type === 'second')?.value ?? '';
    const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';

    this.nowTime = `${hour}:${minute}`;
    this.nowSeconds = second;
    this.nowAmPm = dayPeriod;
    const hourNum = parseInt(hour, 10);
    this.nowSingleDigitHour = hourNum >= 1 && hourNum <= 9;
  }

  /**
   * Apply the saved Night mode setting:
   * - off  → always the normal light layout
   * - on   → always the dark night layout
   * - auto → dark from sunset until sunrise (falls back to 8pm–6am if times aren't ready)
   *
   * When auto flips at sunrise/sunset (or the user toggles), run a 30s sky overlay
   * so the fade feels like sunrise or sunset while the clock stays readable.
   *
   * Also updates optional Sleep mode (15 minutes after Isha → sunrise).
   */
  private updateNightMode(now: Date): void {
    const active = this.settingsService.isNightActive(now);
    if (this.nightModeInitialized && active !== this.nightActive) {
      this.startSkyTransition(active ? 'sunset' : 'sunrise');
    }
    this.nightModeInitialized = true;
    this.nightActive = active;
    this.updateSleepMode(now);
    document.documentElement.classList.toggle('night', this.simpleLayoutUsesDarkTheme);
  }

  /** Sparse Sleep / Always simple layout. */
  private updateSleepMode(now: Date): void {
    this.sleepModeActive =
      this.forceSleepPreview || this.settingsService.isSleepModeActive(now);
    this.sleepOvernightCards =
      this.forceSleepPreview ||
      (this.settings.sleepMode === 'sleep' &&
        this.settingsService.isOvernightSleepWindow(now));

    if (!this.sleepModeActive) {
      this.sunriseCountdown = '';
      this.sleepShowSunriseCountdown = false;
      this.simpleLeft = null;
      this.simpleRight = null;
      return;
    }

    if (this.sleepOvernightCards) {
      this.simpleLeft = null;
      this.simpleRight = null;
      const nowMs = now.getTime();
      const fajrAt = this.resolveSleepFajrAtMs(now);
      const countdownStartsAt =
        fajrAt == null ? null : fajrAt + this.sleepCountdownAfterFajrMs;
      this.sleepShowSunriseCountdown =
        countdownStartsAt != null && nowMs >= countdownStartsAt;

      if (!this.sleepShowSunriseCountdown) {
        this.sunriseCountdown = '';
        return;
      }

      const targetSunrise = this.resolveSleepSunriseAtMs(now);
      if (targetSunrise == null) {
        this.sunriseCountdown = '';
        return;
      }
      this.sunriseCountdown = this.formatHoursMinutes(targetSunrise - nowMs);
      return;
    }

    this.sunriseCountdown = '';
    this.sleepShowSunriseCountdown = false;
    this.updateSimpleLayoutCards(now);
  }

  /**
   * Always-simple cards: left = next event, right = the one after.
   * Sequence: Fajr → Dhuhr → Asr → Sunset → Maghrib (if distinct) → Isha
   * → tomorrow Fajr → tomorrow Sunrise.
   */
  private updateSimpleLayoutCards(now: Date): void {
    const events = this.buildSimpleLayoutEvents(now);
    const nowMs = now.getTime();
    let index = events.findIndex((event) => event.atMs > nowMs);
    if (index < 0) {
      index = Math.max(0, events.length - 2);
    }
    const left = events[index] ?? null;
    const right = events[index + 1] ?? null;
    this.simpleLeft = left
      ? { label: left.label, time: left.time, ampm: left.ampm }
      : null;
    this.simpleRight = right
      ? { label: right.label, time: right.time, ampm: right.ampm }
      : null;
  }

  private buildSimpleLayoutEvents(now: Date): Array<{
    label: string;
    time: string;
    ampm: string;
    atMs: number;
  }> {
    const events: Array<{ label: string; time: string; ampm: string; atMs: number }> = [];
    const push = (
      label: string,
      split: { time: string; ampm: string } | null | undefined,
      atMs: number | null | undefined
    ) => {
      if (!split || atMs == null) return;
      events.push({ label, time: split.time, ampm: split.ampm, atMs });
    };

    push('FAJR', this.times?.fajr, this.prayerInstants.fajr);
    push('DHUHR', this.times?.dhuhr, this.prayerInstants.dhuhr);
    push('ASR', this.times?.asr, this.prayerInstants.asr);
    push('SUNSET', this.sunset, this.sunsetAtMs);

    const maghribAt = this.prayerInstants.maghrib ?? null;
    const sunsetAt = this.sunsetAtMs;
    const maghribDistinct =
      maghribAt != null &&
      sunsetAt != null &&
      Math.abs(maghribAt - sunsetAt) > 60_000;
    if (maghribDistinct) {
      push('MAGHRIB', this.times?.maghrib, maghribAt);
    }

    push('ISHA', this.times?.isha, this.prayerInstants.isha);

    this.ensureTomorrowSunTimes(now);
    if (this.tomorrowFajr && this.tomorrowFajrAtMs != null) {
      events.push({
        label: 'FAJR',
        time: this.tomorrowFajr.time,
        ampm: this.tomorrowFajr.ampm,
        atMs: this.tomorrowFajrAtMs,
      });
    }
    // After tomorrow Fajr, the following card is tomorrow's sunrise (not blank).
    if (this.tomorrowSunrise && this.tomorrowSunriseAtMs != null) {
      events.push({
        label: 'SUNRISE',
        time: this.tomorrowSunrise.time,
        ampm: this.tomorrowSunrise.ampm,
        atMs: this.tomorrowSunriseAtMs,
      });
    }

    return events;
  }

  /** Fajr instant for the current Sleep session (tonight → tomorrow Fajr, or today's morning Fajr). */
  private resolveSleepFajrAtMs(now: Date): number | null {
    const nowMs = now.getTime();
    if (this.sunriseAtMs != null && nowMs < this.sunriseAtMs) {
      return this.prayerInstants.fajr ?? null;
    }
    this.ensureTomorrowSunTimes(now);
    return this.tomorrowFajrAtMs;
  }

  /**
   * Three classical windows when voluntary prayer is prohibited:
   * sunrise→+15m, Dhuhr−10m→Dhuhr, Maghrib−15m→Maghrib.
   */
  private updatePrayerBan(now: Date): void {
    if (this.settings.prayerBanAlert === false) {
      this.prayerBanActive = false;
      this.prayerBanUntilLabel = '';
      return;
    }

    const nowMs = now.getTime();
    const sunrise = this.sunriseAtMs;
    const dhuhr = this.prayerInstants.dhuhr ?? null;
    const maghrib = this.prayerInstants.maghrib ?? null;

    if (sunrise != null) {
      const end = sunrise + this.sunriseBanMs;
      if (nowMs >= sunrise && nowMs < end) {
        this.prayerBanActive = true;
        this.prayerBanUntilLabel = `UNTIL ${this.formatClockLabel(end)}`;
        return;
      }
    }

    if (dhuhr != null) {
      const start = dhuhr - this.zawalBeforeDhuhrMs;
      if (nowMs >= start && nowMs < dhuhr) {
        this.prayerBanActive = true;
        this.prayerBanUntilLabel = 'UNTIL DHUHR';
        return;
      }
    }

    if (maghrib != null) {
      const start = maghrib - this.maghribBanMs;
      if (nowMs >= start && nowMs < maghrib) {
        this.prayerBanActive = true;
        this.prayerBanUntilLabel = 'UNTIL MAGHRIB';
        return;
      }
    }

    this.prayerBanActive = false;
    this.prayerBanUntilLabel = '';
  }

  private formatClockLabel(atMs: number): string {
    const parts = this.timeFormatter.formatToParts(new Date(atMs));
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
    const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toUpperCase();
    return `${hour}:${minute} ${dayPeriod}`.trim();
  }

  /** Next sunrise epoch for Sleep mode (today before dawn, otherwise tomorrow). */
  private resolveSleepSunriseAtMs(now: Date): number | null {
    const nowMs = now.getTime();
    if (this.sunriseAtMs != null && this.sunriseAtMs > nowMs) {
      return this.sunriseAtMs;
    }
    this.ensureTomorrowSunTimes(now);
    if (this.tomorrowSunriseAtMs != null) {
      return this.tomorrowSunriseAtMs;
    }
    if (this.forceSleepPreview && this.sunriseAtMs != null) {
      return this.sunriseAtMs + 24 * 60 * 60 * 1000;
    }
    return null;
  }

  private ensureTomorrowSunTimes(now: Date): void {
    if (!this.settings.coords) return;
    const todayKey = this.prayerTimes.getLocalDateKey(now);
    if (this.tomorrowFajrForDateKey === todayKey && this.tomorrowSunriseAtMs != null) {
      return;
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimes = this.prayerTimes.computeTimes(this.settings, tomorrow);
    this.tomorrowFajrAtMs = this.parseTimeToEpoch(tomorrowTimes.fajr, tomorrow);
    this.tomorrowSunriseAtMs = this.parseTimeToEpoch(tomorrowTimes.sunrise, tomorrow);
    this.tomorrowFajr = this.splitTime(tomorrowTimes.fajr);
    this.tomorrowSunrise = this.splitTime(tomorrowTimes.sunrise);
    this.tomorrowFajrForDateKey = todayKey;
  }

  private formatHoursMinutes(diffMs: number): string {
    const totalMinutes = Math.floor(Math.max(0, diffMs) / 60_000);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh}:${String(mm).padStart(2, '0')}`;
  }

  private startSkyTransition(kind: 'sunrise' | 'sunset'): void {
    if (this.skyTransitionTimer) clearTimeout(this.skyTransitionTimer);
    this.skyTransition = kind;
    this.skyTransitionTimer = setTimeout(() => {
      this.skyTransition = null;
      this.skyTransitionTimer = null;
    }, this.skyTransitionMs);
  }

  /** Apply screen layout from settings (auto / landscape / portrait). */
  private updateScreenLayout(): void {
    const mode = this.settings.screenLayout ?? 'auto';
    if (mode === 'portrait') {
      this.portraitLayout = true;
    } else if (mode === 'landscape') {
      this.portraitLayout = false;
    } else {
      this.portraitLayout = this.portraitMediaQuery.matches;
    }
  }
}

