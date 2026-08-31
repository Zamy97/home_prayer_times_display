import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PrayTimeMethod } from '../lib/praytime';

export type AsrMethod = 'Standard' | 'Hanafi';

/**
 * Night mode display preference:
 * - 'off'  : always use the normal (light) layout
 * - 'on'   : always use the dark night layout
 * - 'auto' : dark night layout automatically between sunset and sunrise
 */
export type NightMode = 'off' | 'on' | 'auto';

/**
 * Screen layout preference:
 * - 'auto'      : portrait stack when the device is vertical, wall layout when horizontal
 * - 'landscape' : always wall layout (clock beside prayer grid)
 * - 'portrait'  : always stacked layout (clock on top)
 */
export type ScreenLayout = 'auto' | 'landscape' | 'portrait';

function isScreenLayout(value: unknown): value is ScreenLayout {
  return value === 'auto' || value === 'landscape' || value === 'portrait';
}

/** User-controlled size multipliers for the clock panel (1 = default). */
export type ClockPanelScale = {
  date: number;
  temp: number;
  /** Main clock when the hour is 1–9. */
  clock: number;
  /** Main clock when the hour is 10–12. */
  clockDouble: number;
  countdown: number;
  sun: number;
};

export const CLOCK_PANEL_SCALE_MIN = 0.6;
export const CLOCK_PANEL_SCALE_MAX = 2.5;
export const CLOCK_PANEL_SCALE_STEP = 0.02;

/** Shared min/max/step for clock and prayer panel sizing studios. */
export const PANEL_SCALE_MIN = CLOCK_PANEL_SCALE_MIN;
export const PANEL_SCALE_MAX = CLOCK_PANEL_SCALE_MAX;
export const PANEL_SCALE_STEP = CLOCK_PANEL_SCALE_STEP;

export const DEFAULT_CLOCK_PANEL_SCALE: ClockPanelScale = {
  date: 1,
  temp: 1,
  clock: 1,
  clockDouble: 1,
  countdown: 1,
  sun: 1,
};

/** User-controlled size multipliers for the prayer grid. */
export type PrayerPanelScale = {
  names: number;
  times: number;
  labels: number;
};

export const DEFAULT_PRAYER_PANEL_SCALE: PrayerPanelScale = {
  names: 1,
  times: 1,
  labels: 1,
};

/** One-time upgrade path for settings saved before per-element sizing sliders existed. */
const LEGACY_MONITOR_PRESETS: Record<
  string,
  { clock: ClockPanelScale; prayer: PrayerPanelScale }
> = {
  '14': {
    clock: { date: 0.74, temp: 0.78, clock: 1, clockDouble: 1, countdown: 0.74, sun: 0.74 },
    prayer: { names: 0.82, times: 0.82, labels: 0.82 },
  },
  '15': {
    clock: { date: 0.8, temp: 0.84, clock: 1, clockDouble: 1, countdown: 0.8, sun: 0.8 },
    prayer: { names: 0.86, times: 0.86, labels: 0.86 },
  },
  '16': {
    clock: { date: 0.84, temp: 0.87, clock: 1, clockDouble: 1, countdown: 0.84, sun: 0.84 },
    prayer: { names: 0.9, times: 0.9, labels: 0.9 },
  },
  '22': {
    clock: { date: 0.88, temp: 0.9, clock: 1, clockDouble: 1, countdown: 0.88, sun: 0.88 },
    prayer: { names: 0.92, times: 0.92, labels: 0.92 },
  },
  '23': {
    clock: { date: 0.94, temp: 0.95, clock: 1, clockDouble: 1, countdown: 0.94, sun: 0.94 },
    prayer: { names: 0.96, times: 0.96, labels: 0.96 },
  },
  '24': {
    clock: { date: 1, temp: 1, clock: 1, clockDouble: 1, countdown: 1, sun: 1 },
    prayer: { names: 1, times: 1, labels: 1 },
  },
  '27': {
    clock: { date: 1.08, temp: 0.96, clock: 1, clockDouble: 1, countdown: 1.1, sun: 1 },
    prayer: { names: 1.08, times: 1.08, labels: 1.08 },
  },
  '32': {
    clock: { date: 1.12, temp: 0.94, clock: 1, clockDouble: 1, countdown: 1.14, sun: 1 },
    prayer: { names: 1.12, times: 1.12, labels: 1.12 },
  },
};

function migrateLegacyMonitorPreset(monitorSize: unknown): {
  clock: ClockPanelScale;
  prayer: PrayerPanelScale;
} | null {
  if (typeof monitorSize !== 'string') return null;
  return LEGACY_MONITOR_PRESETS[monitorSize] ?? null;
}

function clampScale(value: number): number {
  return Math.round(Math.min(CLOCK_PANEL_SCALE_MAX, Math.max(CLOCK_PANEL_SCALE_MIN, value)) * 100) / 100;
}

function isClockPanelScale(value: unknown): value is ClockPanelScale {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o['date'] === 'number' &&
    typeof o['temp'] === 'number' &&
    typeof o['clock'] === 'number' &&
    typeof o['countdown'] === 'number' &&
    typeof o['sun'] === 'number'
  );
}

function normalizeClockPanelScale(scale: ClockPanelScale): ClockPanelScale {
  const clock = clampScale(scale.clock);
  return {
    date: clampScale(scale.date),
    temp: clampScale(scale.temp),
    clock,
    clockDouble: clampScale(scale.clockDouble ?? clock),
    countdown: clampScale(scale.countdown),
    sun: clampScale(scale.sun),
  };
}

function resolveClockPanelScale(parsed: {
  clockPanelScale?: unknown;
  monitorSize?: unknown;
}): ClockPanelScale {
  if (isClockPanelScale(parsed.clockPanelScale)) {
    return normalizeClockPanelScale(parsed.clockPanelScale);
  }
  const migrated = migrateLegacyMonitorPreset(parsed.monitorSize);
  if (migrated) {
    return normalizeClockPanelScale(migrated.clock);
  }
  return { ...DEFAULT_CLOCK_PANEL_SCALE };
}

function isPrayerPanelScale(value: unknown): value is PrayerPanelScale {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o['names'] === 'number' &&
    typeof o['times'] === 'number' &&
    typeof o['labels'] === 'number'
  );
}

function normalizePrayerPanelScale(scale: PrayerPanelScale): PrayerPanelScale {
  return {
    names: clampScale(scale.names),
    times: clampScale(scale.times),
    labels: clampScale(scale.labels),
  };
}

function resolvePrayerPanelScale(parsed: {
  prayerPanelScale?: unknown;
  monitorSize?: unknown;
}): PrayerPanelScale {
  if (isPrayerPanelScale(parsed.prayerPanelScale)) {
    return normalizePrayerPanelScale(parsed.prayerPanelScale);
  }
  const migrated = migrateLegacyMonitorPreset(parsed.monitorSize);
  if (migrated) {
    return normalizePrayerPanelScale(migrated.prayer);
  }
  return { ...DEFAULT_PRAYER_PANEL_SCALE };
}

/** Clock digit color on the light (day) layout */
export type DayClockColor =
  | 'black'
  | 'navy'
  | 'charcoal'
  | 'brown'
  | 'green'
  | 'maroon'
  | 'blue'
  | 'amber'
  | 'soft-gold'
  | 'orange'
  | 'coral'
  | 'rose'
  | 'pink'
  | 'hot-pink'
  | 'lilac'
  | 'purple'
  | 'mint'
  | 'teal'
  | 'sky-blue'
  | 'navy-blue';

/** Clock / accent color on the dark (night) layout */
export type NightClockColor =
  | 'amber'
  | 'red'
  | 'led-red'
  | 'orange'
  | 'warm-white'
  | 'green'
  | 'teal'
  | 'rose'
  | 'dim-white'
  | 'sky-blue'
  | 'navy-blue'
  | 'pink'
  | 'hot-pink'
  | 'purple'
  | 'lilac'
  | 'mint'
  | 'coral'
  | 'soft-gold';

export const DAY_CLOCK_COLOR_HEX: Record<DayClockColor, string> = {
  black: '#111111',
  navy: '#07233c',
  charcoal: '#3a3a3a',
  brown: '#5c3a21',
  green: '#1f4d2e',
  maroon: '#6b1c2a',
  blue: '#1a3a6b',
  amber: '#9a6018',
  'soft-gold': '#8a6518',
  orange: '#9a5018',
  coral: '#b04a38',
  rose: '#9a4058',
  pink: '#b03d80',
  'hot-pink': '#c41872',
  lilac: '#6848a8',
  purple: '#5a3d9a',
  mint: '#1a7560',
  teal: '#1a6565',
  'sky-blue': '#1565a0',
  'navy-blue': '#2a5298',
};

export const NIGHT_CLOCK_COLOR_HEX: Record<NightClockColor, string> = {
  amber: '#d68f47',
  red: '#b54a3c',
  'led-red': '#ff2a2a',
  orange: '#c46a2b',
  'warm-white': '#d4c4a8',
  green: '#4a8f5c',
  teal: '#3d8a8a',
  rose: '#c47a8a',
  'dim-white': '#b8b8b8',
  'sky-blue': '#72cce8',
  'navy-blue': '#5a8fd4',
  pink: '#e8a0c4',
  'hot-pink': '#ff6eb8',
  purple: '#9b86d8',
  lilac: '#b8a0e8',
  mint: '#6ecfb0',
  coral: '#e09078',
  'soft-gold': '#d4b870',
};

const DAY_CLOCK_COLOR_VALUES = Object.keys(DAY_CLOCK_COLOR_HEX) as DayClockColor[];
const NIGHT_CLOCK_COLOR_VALUES = Object.keys(NIGHT_CLOCK_COLOR_HEX) as NightClockColor[];

function isDayClockColor(value: unknown): value is DayClockColor {
  return typeof value === 'string' && DAY_CLOCK_COLOR_VALUES.includes(value as DayClockColor);
}

function isNightClockColor(value: unknown): value is NightClockColor {
  return typeof value === 'string' && NIGHT_CLOCK_COLOR_VALUES.includes(value as NightClockColor);
}

export type PrayerSettings = {
  coords: { lat: number; lng: number } | null;
  method: PrayTimeMethod;
  asr: AsrMethod;
  timezone: string; // IANA tz (e.g. America/Toronto)
  /** true = clock/date panel on left, false = on right */
  panelLeft: boolean;
  /** When to switch to the dark night layout. Default off so existing kiosks stay light until chosen. */
  nightMode: NightMode;
  /** Wall vs stacked layout. Auto follows device orientation. */
  screenLayout: ScreenLayout;
  /** Clock-panel typography multipliers (date, weather, clock, countdown, sunrise/sunset). */
  clockPanelScale: ClockPanelScale;
  /** Prayer-grid typography multipliers (names, times, column labels). */
  prayerPanelScale: PrayerPanelScale;
  /** Clock digit color used in the light (day) layout */
  dayClockColor: DayClockColor;
  /** Clock / accent color used in the dark (night) layout */
  nightClockColor: NightClockColor;
  /** id from cities list, or empty string when using "Other" / manual coords */
  cityId?: string;
};

const DEFAULT_SETTINGS: PrayerSettings = {
  // Default location (ZIP 48015) so the app works out-of-the-box on kiosk devices.
  coords: { lat: 42.4788, lng: -83.0248 },
  method: 'ISNA',
  asr: 'Hanafi',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  panelLeft: true,
  nightMode: 'off',
  screenLayout: 'auto',
  clockPanelScale: { ...DEFAULT_CLOCK_PANEL_SCALE },
  prayerPanelScale: { ...DEFAULT_PRAYER_PANEL_SCALE },
  dayClockColor: 'black',
  nightClockColor: 'amber',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storageKey = 'prayerSettings';
  private readonly previewChannel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('prayer-display-settings') : null;

  private readonly subject = new BehaviorSubject<PrayerSettings>(this.load());
  readonly settings$ = this.subject.asObservable();

  /** Today's sunrise/sunset instants, used by automatic night mode. */
  private sunriseAtMs: number | null = null;
  private sunsetAtMs: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Same-tab iframes (settings preview) — storage events do not fire in the document that wrote.
      this.previewChannel?.addEventListener('message', (event: MessageEvent<PrayerSettings>) => {
        if (event.data) {
          this.subject.next(this.parseStoredSettings(event.data));
        }
      });

      window.addEventListener('message', (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'prayer-settings-sync' || !event.data.settings) return;
        this.subject.next(this.parseStoredSettings(event.data.settings as Partial<PrayerSettings>));
      });

      // Other tabs / windows
      window.addEventListener('storage', (event) => {
        if (event.key !== this.storageKey || !event.newValue) return;
        try {
          this.subject.next(this.parseStoredSettings(JSON.parse(event.newValue)));
        } catch {
          // ignore malformed storage payloads
        }
      });
    }
  }

  getSettings(): PrayerSettings {
    return this.subject.value;
  }

  saveSettings(next: PrayerSettings): void {
    this.subject.next(next);
    this.persist(next);
    try {
      this.previewChannel?.postMessage(next);
    } catch {
      // ignore BroadcastChannel failures
    }
  }

  /** Live preview for clock-panel sliders — persists immediately so the preview iframe can follow. */
  previewClockPanelScale(scale: ClockPanelScale): void {
    const next = {
      ...this.getSettings(),
      clockPanelScale: normalizeClockPanelScale(scale),
    };
    this.saveSettings(next);
  }

  /** Live preview for prayer-grid sliders — persists immediately so the preview iframe can follow. */
  previewPrayerPanelScale(scale: PrayerPanelScale): void {
    const next = {
      ...this.getSettings(),
      prayerPanelScale: normalizePrayerPanelScale(scale),
    };
    this.saveSettings(next);
  }

  private persist(next: PrayerSettings): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(next));
    } catch {
      // ignore storage failures (private mode / full storage)
    }
  }

  setSunTimes(sunriseAtMs: number | null, sunsetAtMs: number | null): void {
    this.sunriseAtMs = sunriseAtMs;
    this.sunsetAtMs = sunsetAtMs;
  }

  /**
   * Whether the dark night layout should be showing right now, based on the
   * saved setting (off / always on / automatic sunset→sunrise).
   */
  isNightActive(now = new Date()): boolean {
    const mode = this.getSettings().nightMode ?? 'off';
    if (mode === 'on') return true;
    if (mode !== 'auto') return false;

    const nowMs = now.getTime();
    if (
      this.sunriseAtMs != null &&
      this.sunsetAtMs != null &&
      new Date(this.sunriseAtMs).toDateString() === now.toDateString()
    ) {
      return nowMs < this.sunriseAtMs || nowMs >= this.sunsetAtMs;
    }

    // Times not ready yet: 8pm–6am local is a safe bedroom-hours fallback.
    const hour = now.getHours();
    return hour >= 20 || hour < 6;
  }

  /** Hex color for the clock in the current (or given) day/night state. */
  clockColorHex(night = this.isNightActive()): string {
    const s = this.getSettings();
    if (night) {
      return NIGHT_CLOCK_COLOR_HEX[s.nightClockColor] ?? NIGHT_CLOCK_COLOR_HEX.amber;
    }
    return DAY_CLOCK_COLOR_HEX[s.dayClockColor] ?? DAY_CLOCK_COLOR_HEX.black;
  }

  private load(): PrayerSettings {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw) as Partial<PrayerSettings> & { monitorSize?: unknown };
      const settings = this.parseStoredSettings(parsed);
      if ('monitorSize' in parsed) {
        // Upgrade old monitor-size preset to slider values and drop the obsolete key.
        this.persist(settings);
      }
      return settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private parseStoredSettings(parsed: Partial<PrayerSettings> & { monitorSize?: unknown }): PrayerSettings {
    return {
      coords: parsed.coords ?? DEFAULT_SETTINGS.coords,
      method: (parsed.method as PrayTimeMethod) ?? DEFAULT_SETTINGS.method,
      asr: (parsed.asr as AsrMethod) ?? DEFAULT_SETTINGS.asr,
      timezone: parsed.timezone ?? DEFAULT_SETTINGS.timezone,
      panelLeft: parsed.panelLeft ?? DEFAULT_SETTINGS.panelLeft,
      nightMode:
        parsed.nightMode === 'off' || parsed.nightMode === 'on' || parsed.nightMode === 'auto'
          ? parsed.nightMode
          : DEFAULT_SETTINGS.nightMode,
      screenLayout: isScreenLayout(parsed.screenLayout)
        ? parsed.screenLayout
        : DEFAULT_SETTINGS.screenLayout,
      clockPanelScale: resolveClockPanelScale(parsed),
      prayerPanelScale: resolvePrayerPanelScale(parsed),
      dayClockColor: isDayClockColor(parsed.dayClockColor)
        ? parsed.dayClockColor
        : DEFAULT_SETTINGS.dayClockColor,
      nightClockColor: isNightClockColor(parsed.nightClockColor)
        ? parsed.nightClockColor
        : DEFAULT_SETTINGS.nightClockColor,
      cityId: typeof parsed.cityId === 'string' ? parsed.cityId : undefined,
    };
  }
}
