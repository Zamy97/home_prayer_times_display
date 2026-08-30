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

/** Physical monitor size — scales typography to fill the screen at a comfortable read distance. */
export type MonitorSize = '14' | '15' | '16' | '22' | '23' | '24' | '27' | '32';

const MONITOR_SIZE_VALUES: MonitorSize[] = ['14', '15', '16', '22', '23', '24', '27', '32'];

function isMonitorSize(value: unknown): value is MonitorSize {
  return typeof value === 'string' && MONITOR_SIZE_VALUES.includes(value as MonitorSize);
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
  /** TV / monitor diagonal — scales dates, countdown, sun times, and prayer grid. */
  monitorSize: MonitorSize;
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
  monitorSize: '24',
  dayClockColor: 'black',
  nightClockColor: 'amber',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storageKey = 'prayerSettings';

  private readonly subject = new BehaviorSubject<PrayerSettings>(this.load());
  readonly settings$ = this.subject.asObservable();

  /** Today's sunrise/sunset instants, used by automatic night mode. */
  private sunriseAtMs: number | null = null;
  private sunsetAtMs: number | null = null;

  getSettings(): PrayerSettings {
    return this.subject.value;
  }

  saveSettings(next: PrayerSettings): void {
    this.subject.next(next);
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
      const parsed = JSON.parse(raw) as Partial<PrayerSettings>;
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
        monitorSize: isMonitorSize(parsed.monitorSize)
          ? parsed.monitorSize
          : DEFAULT_SETTINGS.monitorSize,
        dayClockColor: isDayClockColor(parsed.dayClockColor)
          ? parsed.dayClockColor
          : DEFAULT_SETTINGS.dayClockColor,
        nightClockColor: isNightClockColor(parsed.nightClockColor)
          ? parsed.nightClockColor
          : DEFAULT_SETTINGS.nightClockColor,
        cityId: typeof parsed.cityId === 'string' ? parsed.cityId : undefined,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}
