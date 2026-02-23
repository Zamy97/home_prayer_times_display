import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PrayTimeMethod } from '../lib/praytime';

export type AsrMethod = 'Standard' | 'Hanafi';

export type PrayerSettings = {
  coords: { lat: number; lng: number } | null;
  method: PrayTimeMethod;
  asr: AsrMethod;
  timezone: string; // IANA tz (e.g. America/Toronto)
  /** true = clock/date panel on left, false = on right */
  panelLeft: boolean;
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
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storageKey = 'prayerSettings.v1';

  private readonly subject = new BehaviorSubject<PrayerSettings>(this.load());
  readonly settings$ = this.subject.asObservable();

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
        cityId: typeof parsed.cityId === 'string' ? parsed.cityId : undefined,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

