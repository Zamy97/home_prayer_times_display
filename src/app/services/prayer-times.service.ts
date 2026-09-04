import { Injectable } from '@angular/core';
import { PrayTime, PrayTimeMethod, PrayTimeSettings, PrayTimeTimes } from '../lib/praytime';
import { PrayerSettings } from './settings.service';

type PrayerTimesCache = {
  dateKey: string; // local YYYY-MM-DD
  settings: PrayerSettings;
  method: PrayTimeMethod;
  asr: 'Standard' | 'Hanafi';
  fajrAngle: PrayerSettings['fajrAngle'];
  ishaAngle: PrayerSettings['ishaAngle'];
  times: PrayTimeTimes<string>;
};

@Injectable({ providedIn: 'root' })
export class PrayerTimesService {
  private readonly cacheKey = 'prayerTimes.v4';

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
    if ((cached.fajrAngle ?? 'method') !== (settings.fajrAngle ?? 'method')) return null;
    if ((cached.ishaAngle ?? 'method') !== (settings.ishaAngle ?? 'method')) return null;
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
    const times = this.computeTimes(settings, new Date());
    const payload: PrayerTimesCache = {
      dateKey: this.getLocalDateKey(),
      settings,
      method: settings.method,
      asr: settings.asr,
      fajrAngle: settings.fajrAngle ?? 'method',
      ishaAngle: settings.ishaAngle ?? 'method',
      times,
    };
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(payload));
    } catch {
      // ignore storage failures (private mode / full storage)
    }
    return payload;
  }

  computeTimes(settings: PrayerSettings, date: Date): PrayTimeTimes<string> {
    if (!settings.coords) {
      throw new Error('Prayer settings missing coords');
    }

    const adjust: PrayTimeSettings = { asr: settings.asr };
    if (settings.fajrAngle !== 'method' && typeof settings.fajrAngle === 'number') {
      adjust.fajr = settings.fajrAngle;
    }
    if (settings.ishaAngle !== 'method' && typeof settings.ishaAngle === 'number') {
      adjust.isha = settings.ishaAngle;
    }

    const prayTime = new PrayTime(settings.method).format('12h').round('nearest').adjust(adjust);
    prayTime.location([settings.coords.lat, settings.coords.lng]).timezone(settings.timezone);
    return prayTime.times(date);
  }
}
