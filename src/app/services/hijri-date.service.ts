import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** CHC / moonsighting Hijri calendar for one year. */
export type ChcHijriCalendar = {
  hijriYear: number;
  /** Gregorian civil date of 1 Muharram, YYYY-MM-DD */
  firstDay: string;
  daysInMonths: number[];
};

export type HijriDateInfo = {
  day: number;
  monthIndex: number;
  monthName: string;
  year: number;
  label: string;
  source: 'chc' | 'intl';
};

type HijriApiResponse = {
  source?: string;
  today?: {
    day?: number;
    monthIndex?: number;
    monthName?: string;
    year?: number;
    label?: string;
  };
  calendar?: {
    hijriYear?: number;
    firstDay?: string;
    daysInMonths?: number[];
  };
};

type ChcHijriDatesPayload = {
  HijriYear?: number;
  FirstDay?: string;
  NumOfDays?: Record<string, number>;
};

const STORAGE_KEY = 'chcHijriCalendar';
/** How often we try to refresh CHC data when online. */
const SOFT_REFRESH_MS = 6 * 60 * 60 * 1000;
/**
 * Keep using a cached CHC calendar for formatting even after soft refresh fails
 * (offline kiosk). Only fall back to Intl when we have never successfully loaded CHC.
 */
const HARD_STALE_MS = 45 * 24 * 60 * 60 * 1000;

/** Month names used by Central Hilal Committee announcements / homepage. */
export const CHC_HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhul Qi'dah",
  'Dhul Hijjah',
] as const;

@Injectable({ providedIn: 'root' })
export class HijriDateService {
  private readonly http = inject(HttpClient);
  private calendar: ChcHijriCalendar | null = this.readCache();
  private load$?: Observable<ChcHijriCalendar | null>;
  /** Throttle soft-refresh attempts when offline so we don't hammer the network. */
  private lastAttemptAt = 0;

  /** Ensure CHC calendar is loaded (cached). Safe to call repeatedly. */
  ensureCalendar(): Observable<ChcHijriCalendar | null> {
    if (this.calendar && !this.needsSoftRefresh()) {
      return of(this.calendar);
    }
    if (this.needsSoftRefresh()) {
      this.load$ = undefined;
    }
    if (!this.load$) {
      this.lastAttemptAt = Date.now();
      this.load$ = this.fetchCalendar().pipe(
        tap((cal) => {
          if (cal) {
            this.calendar = cal;
            this.writeCache(cal);
          }
          // Keep prior CHC calendar when refresh fails (offline / flaky Wi‑Fi).
        }),
        map((cal) => cal ?? this.calendar),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.load$;
  }

  /**
   * Soft refresh: try CHC / proxy again without wiping the last good calendar.
   * Used on date change so offline still shows moonsighting day/name, while still
   * attempting the API whenever connectivity may be available.
   */
  refresh(): Observable<ChcHijriCalendar | null> {
    this.load$ = undefined;
    this.lastAttemptAt = Date.now();
    this.load$ = this.fetchCalendar().pipe(
      tap((cal) => {
        if (cal) {
          this.calendar = cal;
          this.writeCache(cal);
        }
      }),
      map((cal) => cal ?? this.calendar),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.load$;
  }

  /** Format Hijri label for a civil date; prefers CHC moonsighting calendar. */
  formatForDate(date: Date): HijriDateInfo {
    const usable = this.calendarForFormat();
    const fromChc = this.formatFromCalendar(date, usable);
    if (fromChc) return fromChc;
    return this.formatFromIntl(date);
  }

  private calendarForFormat(): ChcHijriCalendar | null {
    if (!this.calendar) return null;
    if (this.isHardStale()) return null;
    return this.calendar;
  }

  private fetchCalendar(): Observable<ChcHijriCalendar | null> {
    if (environment.production) {
      // Kiosk serve.py and Vercel both expose /api/hijri; still try CHC direct if proxy is down.
      return this.http.get<HijriApiResponse>('/api/hijri').pipe(
        map((res) => this.fromProxy(res)),
        switchMap((fromProxy) => {
          if (fromProxy) return of(fromProxy);
          return this.fetchChcDirect();
        }),
        catchError(() => this.fetchChcDirect())
      );
    }
    return this.fetchChcDirect();
  }

  private fetchChcDirect(): Observable<ChcHijriCalendar | null> {
    return this.http
      .get<ChcHijriDatesPayload>('https://hilalcommittee.org/api/HijriDates')
      .pipe(
        map((res) => this.fromChcApi(res)),
        catchError(() => of(null))
      );
  }

  private fromProxy(res: HijriApiResponse): ChcHijriCalendar | null {
    const year = res.calendar?.hijriYear;
    const firstDay = res.calendar?.firstDay;
    const days = res.calendar?.daysInMonths;
    if (!year || !firstDay || !Array.isArray(days) || days.length !== 12) return null;
    return {
      hijriYear: year,
      firstDay: firstDay.slice(0, 10),
      daysInMonths: days.map((n) => (n === 29 || n === 30 ? n : 30)),
    };
  }

  private fromChcApi(res: ChcHijriDatesPayload): ChcHijriCalendar | null {
    const year = res.HijriYear;
    const firstDay = String(res.FirstDay ?? '').slice(0, 10);
    if (!year || !/^\d{4}-\d{2}-\d{2}$/.test(firstDay)) return null;
    const daysInMonths: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const n = Number(res.NumOfDays?.[`NumDaysMonth${i}`]);
      daysInMonths.push(n === 29 || n === 30 ? n : 30);
    }
    return { hijriYear: year, firstDay, daysInMonths };
  }

  private formatFromCalendar(date: Date, calendar: ChcHijriCalendar | null): HijriDateInfo | null {
    if (!calendar) return null;
    const first = this.parseYmd(calendar.firstDay);
    if (!first) return null;

    let cursor = this.toOrdinal(first);
    const target = this.toOrdinal({
      y: date.getFullYear(),
      m: date.getMonth() + 1,
      d: date.getDate(),
    });

    for (let i = 0; i < 12; i++) {
      const len = calendar.daysInMonths[i] ?? 30;
      const end = cursor + len - 1;
      if (target >= cursor && target <= end) {
        const day = target - cursor + 1;
        const monthName = CHC_HIJRI_MONTHS[i];
        return {
          day,
          monthIndex: i + 1,
          monthName,
          year: calendar.hijriYear,
          label: `${monthName.toUpperCase()} ${day}`,
          source: 'chc',
        };
      }
      cursor = end + 1;
    }
    return null;
  }

  private formatFromIntl(date: Date): HijriDateInfo {
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    const rawMonth = parts.find((p) => p.type === 'month')?.value ?? '';
    const monthName = this.normalizeIntlMonthName(rawMonth);
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
    const year = Number(parts.find((p) => p.type === 'year')?.value ?? 0);
    const monthIndex = CHC_HIJRI_MONTHS.findIndex((m) => m === monthName) + 1;
    return {
      day,
      monthIndex,
      monthName,
      year,
      label: `${monthName.toUpperCase()} ${day}`.trim(),
      source: 'intl',
    };
  }

  /**
   * Intl islamic months often look like "Rabiʻ II" / "Rab. II". Prefer the same
   * full CHC-style names we use when the moonsighting calendar is available,
   * so offline / no-Wi‑Fi still reads clearly.
   */
  private normalizeIntlMonthName(raw: string): string {
    const key = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ʼ'`ʻʹʺ]/g, '')
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const aliases: Record<string, (typeof CHC_HIJRI_MONTHS)[number]> = {
      muharram: 'Muharram',
      safar: 'Safar',
      'rabi i': 'Rabi al-Awwal',
      'rabi 1': 'Rabi al-Awwal',
      'rabi al awwal': 'Rabi al-Awwal',
      'rabi al-awwal': 'Rabi al-Awwal',
      'rab i': 'Rabi al-Awwal',
      'rabi ii': 'Rabi al-Thani',
      'rabi ll': 'Rabi al-Thani',
      'rabi 2': 'Rabi al-Thani',
      'rabi al thani': 'Rabi al-Thani',
      'rabi al-thani': 'Rabi al-Thani',
      'rab ii': 'Rabi al-Thani',
      'rab ll': 'Rabi al-Thani',
      'jumada i': 'Jumada al-Ula',
      'jumada 1': 'Jumada al-Ula',
      'jumada al ula': 'Jumada al-Ula',
      'jumada ii': 'Jumada al-Akhirah',
      'jumada ll': 'Jumada al-Akhirah',
      'jumada 2': 'Jumada al-Akhirah',
      'jumada al akhirah': 'Jumada al-Akhirah',
      rajab: 'Rajab',
      shaban: "Sha'ban",
      "sha'ban": "Sha'ban",
      ramadan: 'Ramadan',
      shawwal: 'Shawwal',
      "dhul qidah": "Dhul Qi'dah",
      "dhu al qidah": "Dhul Qi'dah",
      "dhul hijjah": 'Dhul Hijjah',
      "dhu al hijjah": 'Dhul Hijjah',
    };

    const mapped = aliases[key];
    if (mapped) return mapped;
    return raw.replace(/[-']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private parseYmd(raw: string): { y: number; m: number; d: number } | null {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  private toOrdinal(parts: { y: number; m: number; d: number }): number {
    return Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000;
  }

  private cacheFetchedAt(): number | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { fetchedAt?: number };
      return typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null;
    } catch {
      return null;
    }
  }

  private needsSoftRefresh(): boolean {
    if (!this.calendar) return true;
    const at = this.cacheFetchedAt();
    if (at == null) return true;
    if (Date.now() - at <= SOFT_REFRESH_MS) return false;
    // After soft age, retry at most once per soft interval (covers offline).
    return Date.now() - this.lastAttemptAt >= SOFT_REFRESH_MS;
  }

  private isHardStale(): boolean {
    const at = this.cacheFetchedAt();
    if (at == null) return false;
    return Date.now() - at > HARD_STALE_MS;
  }

  private readCache(): ChcHijriCalendar | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { fetchedAt?: number; calendar?: ChcHijriCalendar };
      if (!parsed.calendar?.hijriYear || !parsed.calendar.firstDay) return null;
      if (!Array.isArray(parsed.calendar.daysInMonths) || parsed.calendar.daysInMonths.length !== 12) {
        return null;
      }
      return parsed.calendar;
    } catch {
      return null;
    }
  }

  private writeCache(calendar: ChcHijriCalendar): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), calendar })
      );
    } catch {
      // ignore quota / private mode
    }
  }
}
