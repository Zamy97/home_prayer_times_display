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

export type PrayerSettings = {
  coords: { lat: number; lng: number } | null;
  method: PrayTimeMethod;
  asr: AsrMethod;
  timezone: string; // IANA tz (e.g. America/Toronto)
  /** true = clock/date panel on left, false = on right */
  panelLeft: boolean;
  /** When to switch to the dark night layout. Default off so existing kiosks stay light until chosen. */
  nightMode: NightMode;
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
        cityId: typeof parsed.cityId === 'string' ? parsed.cityId : undefined,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

