import { Injectable } from '@angular/core';
import { PrayTime, PrayTimeMethod, PrayTimeTimes } from '../lib/praytime';
import { PrayerSettings } from './settings.service';

type PrayerTimesCache = {
  dateKey: string; // local YYYY-MM-DD
  settings: PrayerSettings;
  method: PrayTimeMethod;
  asr: 'Standard' | 'Hanafi';
  times: PrayTimeTimes<string>;
};

@Injectable({ providedIn: 'root' })
export class PrayerTimesService {
  private readonly cacheKey = 'prayerTimes.v3';

  getLocalDateKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Reads the last computed payload (may be for a prior day).
   */
  readCache(): PrayerTimesCache | null {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as PrayerTimesCache;
    } catch {
      return null;
    }
  }

  /**
   * Returns cached prayer times if they match today's dateKey and settings.
   */
  getCachedTodayTimes(settings: PrayerSettings): PrayerTimesCache | null {
    const cached = this.readCache();
    if (!cached) return null;
    const todayKey = this.getLocalDateKey();
    if (cached.dateKey !== todayKey) return null;
    if (cached.method !== settings.method) return null;
    if (cached.asr !== settings.asr) return null;
    if (cached.settings.timezone !== settings.timezone) return null;
    // Coords may be null (if not configured); in that case we don't serve cache.
    if (!settings.coords) return null;
    if (!cached.settings.coords) return null;
    if (cached.settings.coords.lat !== settings.coords.lat) return null;
    if (cached.settings.coords.lng !== settings.coords.lng) return null;
    return cached;
  }

  /**
   * Computes prayer times for today and stores them in localStorage.
   */
  computeAndCacheTodayTimes(settings: PrayerSettings): PrayerTimesCache {
    if (!settings.coords) {
      throw new Error('Prayer settings missing coords');
    }

    const prayTime = new PrayTime(settings.method).format('12h').round('nearest').adjust({ asr: settings.asr });
    prayTime.location([settings.coords.lat, settings.coords.lng]).timezone(settings.timezone);
    const times = prayTime.times(new Date());

    const payload: PrayerTimesCache = {
      dateKey: this.getLocalDateKey(),
      settings,
      method: settings.method,
      asr: settings.asr,
      times,
    };
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(payload));
    } catch {
      // ignore storage failures (private mode / full storage)
    }
    return payload;
  }
}

