import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable, Subscription, of, timer } from 'rxjs';
import { catchError, map, retry, startWith, tap } from 'rxjs/operators';

/** 'off' hides the column; any other value is a mosque slug from the API. */
export type MosqueIqamahSource = 'off' | string;

export type MosqueOption = {
  slug: string;
  name: string;
  city?: string;
  state?: string;
};

export type MosqueIqamahTimes = {
  slug: string;
  name: string;
  date: string;
  fajr?: string;
  dhuhr?: string;
  asr?: string;
  maghrib?: string;
  isha?: string;
};

type TimePair = { adhan?: string | null; iqamah?: string | null };

type MosqueTimesResponse = {
  mosque?: { slug?: string; name?: string };
  today?: {
    date?: string;
    fajr?: TimePair;
    dhuhr?: TimePair;
    asr?: TimePair;
    maghrib?: TimePair;
    isha?: TimePair;
  };
};

const TIMES_CACHE_KEY = 'mosqueIqamah.v2';
const TIMES_CACHE_KEY_V1 = 'mosqueIqamah.v1';
const LIST_CACHE_KEY = 'mosqueList.v1';
const FALLBACK_MOSQUES: MosqueOption[] = [
  { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
  { slug: 'furqaan', name: 'Masjid Al-Furqaan', city: 'Warren', state: 'MI' },
];
/** Posted Furqaan Maghrib iqamah is “10 minutes after sunset”, not a clock time. */
const MAGHRIB_IQAMAH_AFTER_SUNSET_MIN: Record<string, number> = {
  furqaan: 10,
};
/** Render free-tier cold start is often 30–50s; keep trying while yesterday stays on screen. */
const FETCH_RETRY_COUNT = 4;

type StoredDays = {
  slug: string;
  days: Record<string, MosqueIqamahTimes>;
};

export function isMosqueSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value);
}

export function isMosqueIqamahSource(value: unknown): value is MosqueIqamahSource {
  return value === 'off' || isMosqueSlug(value);
}

@Injectable({ providedIn: 'root' })
export class MosqueIqamahService {
  private readonly http = inject(HttpClient);
  private prefetchSub: Subscription | null = null;

  listMosques(): Observable<MosqueOption[]> {
    const cached = this.readListCache();
    const remote$ = this.http.get<MosqueOption[]>('/api/mosques').pipe(
      map((rows) => this.normalizeList(rows)),
      tap((list) => {
        if (list.length) this.writeListCache(list);
      }),
      catchError(() => of(cached.length ? cached : FALLBACK_MOSQUES))
    );
    return cached.length ? remote$.pipe(startWith(cached)) : remote$;
  }

  loadToday(source: MosqueIqamahSource, date = this.todayKey()): Observable<MosqueIqamahTimes | null> {
    if (source === 'off' || !isMosqueSlug(source)) return of(null);
    const exact = this.readDay(source, date);
    const stale = exact ?? this.readLatestDay(source);
    const remote$ = this.fetchDay(source, date).pipe(
      retry({
        count: FETCH_RETRY_COUNT,
        delay: (_err, retryCount) => timer(Math.min(4000 * 2 ** (retryCount - 1), 40000)),
      }),
      tap((times) => {
        if (!times) return;
        this.writeDay(source, times);
        this.prefetchNextDay(source, times.date);
      }),
      map((times) => times ?? stale ?? null),
      catchError(() => (stale ? EMPTY : of(null)))
    );
    return stale ? remote$.pipe(startWith(stale)) : remote$;
  }

  formatIqamah(value?: string | null): { time: string; ampm: string } | null {
    if (!value) return null;
    const [hRaw, mRaw] = value.split(':');
    const hour24 = Number(hRaw);
    const minute = Number(mRaw);
    if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return null;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return { time: `${hour12}:${String(minute).padStart(2, '0')}`, ampm };
  }

  /**
   * Use the posted Maghrib iqamah when the mosque publishes one.
   * Furqaan does not — their sheet is sunset + 10 minutes.
   */
  resolveMaghribIqamah(
    slug: string | undefined,
    posted?: string | null,
    sunsetAtMs?: number | null
  ): { time: string; ampm: string } | null {
    const fromSheet = this.formatIqamah(posted);
    if (fromSheet) return fromSheet;
    const minutes = slug ? MAGHRIB_IQAMAH_AFTER_SUNSET_MIN[slug] : undefined;
    if (minutes == null || sunsetAtMs == null || !Number.isFinite(sunsetAtMs)) return null;
    return this.formatIqamahFromMs(sunsetAtMs + minutes * 60_000);
  }

  private formatIqamahFromMs(ms: number): { time: string; ampm: string } | null {
    const at = new Date(ms);
    const hh = String(at.getHours()).padStart(2, '0');
    const mm = String(at.getMinutes()).padStart(2, '0');
    return this.formatIqamah(`${hh}:${mm}`);
  }

  /** Short kiosk label for the iqamah column header (fits like STARTS). */
  columnLabel(name?: string, slug?: string): string {
    const cleaned = (name || '')
      .replace(/\b(masjid|mosque|islamic center( of)?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const token = cleaned.split(/[\s,/]+/)[0] || slug || 'IQAMAH';
    return token.replace(/-/g, '').slice(0, 10).toUpperCase();
  }

  mosqueOptionLabel(mosque: MosqueOption): string {
    if (mosque.city) return `${mosque.name} (${mosque.city})`;
    return mosque.name;
  }

  private todayKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private shiftDateKey(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y, m - 1, d);
    next.setDate(next.getDate() + days);
    return this.todayKey(next);
  }

  private fetchDay(source: string, date: string): Observable<MosqueIqamahTimes | null> {
    const url =
      `/api/mosques/${encodeURIComponent(source)}/times` +
      `?date=${encodeURIComponent(date)}&days=0`;
    return this.http.get<MosqueTimesResponse>(url).pipe(map((res) => this.fromResponse(source, res)));
  }

  private prefetchNextDay(source: string, todayDate: string): void {
    const nextDate = this.shiftDateKey(todayDate, 1);
    if (this.readDay(source, nextDate)) return;
    this.prefetchSub?.unsubscribe();
    this.prefetchSub = this.fetchDay(source, nextDate)
      .pipe(
        retry({
          count: 2,
          delay: () => timer(10000),
        }),
        tap((times) => {
          if (times) this.writeDay(source, times);
        }),
        catchError(() => EMPTY)
      )
      .subscribe();
  }

  private fromResponse(
    source: MosqueIqamahSource,
    res: MosqueTimesResponse
  ): MosqueIqamahTimes | null {
    const today = res.today;
    if (!today?.date) return null;
    return {
      slug: res.mosque?.slug || source,
      name: res.mosque?.name || source,
      date: today.date,
      fajr: today.fajr?.iqamah ?? undefined,
      dhuhr: today.dhuhr?.iqamah ?? undefined,
      asr: today.asr?.iqamah ?? undefined,
      maghrib: today.maghrib?.iqamah ?? undefined,
      isha: today.isha?.iqamah ?? undefined,
    };
  }

  private normalizeList(rows: MosqueOption[] | null | undefined): MosqueOption[] {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => isMosqueSlug(row?.slug) && typeof row?.name === 'string' && row.name.trim())
      .map((row) => ({
        slug: row.slug,
        name: row.name.trim(),
        city: typeof row.city === 'string' ? row.city : undefined,
        state: typeof row.state === 'string' ? row.state : undefined,
      }));
  }

  private readListCache(): MosqueOption[] {
    try {
      const raw = localStorage.getItem(LIST_CACHE_KEY);
      if (!raw) return [];
      return this.normalizeList(JSON.parse(raw) as MosqueOption[]);
    } catch {
      return [];
    }
  }

  private writeListCache(list: MosqueOption[]): void {
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(list));
    } catch {
      // ignore quota / private mode
    }
  }

  private readDay(source: string, date: string): MosqueIqamahTimes | null {
    const store = this.readStore();
    if (store?.slug !== source) return null;
    return store.days[date] ?? null;
  }

  private readLatestDay(source: string): MosqueIqamahTimes | null {
    const store = this.readStore();
    if (store?.slug !== source) return null;
    const dates = Object.keys(store.days).sort();
    const latest = dates[dates.length - 1];
    return latest ? store.days[latest] : null;
  }

  private writeDay(source: string, times: MosqueIqamahTimes): void {
    const prev = this.readStore();
    const days = prev?.slug === source ? { ...prev.days } : {};
    days[times.date] = { ...times, slug: source };
    const keep = new Set([
      this.shiftDateKey(times.date, -1),
      times.date,
      this.shiftDateKey(times.date, 1),
    ]);
    for (const key of Object.keys(days)) {
      if (!keep.has(key)) delete days[key];
    }
    this.writeStore({ slug: source, days });
  }

  private readStore(): StoredDays | null {
    try {
      const raw = localStorage.getItem(TIMES_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredDays;
        if (isMosqueSlug(parsed?.slug) && parsed.days && typeof parsed.days === 'object') {
          return parsed;
        }
      }
      const legacy = localStorage.getItem(TIMES_CACHE_KEY_V1);
      if (!legacy) return null;
      const old = JSON.parse(legacy) as MosqueIqamahTimes;
      if (!isMosqueSlug(old?.slug) || typeof old.date !== 'string') return null;
      const migrated: StoredDays = { slug: old.slug, days: { [old.date]: old } };
      this.writeStore(migrated);
      return migrated;
    } catch {
      return null;
    }
  }

  private writeStore(store: StoredDays): void {
    try {
      localStorage.setItem(TIMES_CACHE_KEY, JSON.stringify(store));
    } catch {
      // ignore quota / private mode
    }
  }
}
