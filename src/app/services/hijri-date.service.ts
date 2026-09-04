import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
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
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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

  /** Ensure CHC calendar is loaded (cached). Safe to call repeatedly. */
  ensureCalendar(): Observable<ChcHijriCalendar | null> {
    if (this.calendar && !this.isStale()) {
      return of(this.calendar);
    }
    if (this.isStale()) {
      this.load$ = undefined;
    }
    if (!this.load$) {
      this.load$ = this.fetchCalendar().pipe(
        tap((cal) => {
          this.calendar = cal;
          if (cal) this.writeCache(cal);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.load$;
  }

  /** Drop cache and refetch from CHC / proxy. */
  refresh(): Observable<ChcHijriCalendar | null> {
    this.load$ = undefined;
    this.calendar = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return this.ensureCalendar();
  }

  /** Format Hijri label for a civil date; prefers CHC moonsighting calendar. */
  formatForDate(date: Date): HijriDateInfo {
    const fromChc = this.formatFromCalendar(date, this.calendar);
    if (fromChc) return fromChc;
    return this.formatFromIntl(date);
  }

  private fetchCalendar(): Observable<ChcHijriCalendar | null> {
    const request$ = environment.production
      ? this.http.get<HijriApiResponse>('/api/hijri').pipe(map((res) => this.fromProxy(res)))
      : this.http
          .get<ChcHijriDatesPayload>('https://hilalcommittee.org/api/HijriDates')
          .pipe(map((res) => this.fromChcApi(res)));

    return request$.pipe(catchError(() => of(this.calendar)));
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
    const monthName = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/[-']/g, ' ');
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
    const year = Number(parts.find((p) => p.type === 'year')?.value ?? 0);
    return {
      day,
      monthIndex: 0,
      monthName,
      year,
      label: `${monthName.toUpperCase()} ${day}`.trim(),
      source: 'intl',
    };
  }

  private parseYmd(raw: string): { y: number; m: number; d: number } | null {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  private toOrdinal(parts: { y: number; m: number; d: number }): number {
    return Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000;
  }

  private isStale(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw) as { fetchedAt?: number; calendar?: ChcHijriCalendar };
      if (!parsed.fetchedAt || !parsed.calendar) return true;
      return Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS;
    } catch {
      return true;
    }
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
