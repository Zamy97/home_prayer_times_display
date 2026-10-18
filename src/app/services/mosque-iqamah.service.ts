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
  address?: string;
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

const TIMES_CACHE_KEY = 'mosqueIqamah.v3';
const TIMES_CACHE_KEY_V1 = 'mosqueIqamah.v1';
const TIMES_CACHE_KEY_V2 = 'mosqueIqamah.v2';
const LIST_CACHE_KEY = 'mosqueList.v3';
const FALLBACK_MOSQUES: MosqueOption[] = [
  { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI', address: '28630 Ryan Rd' },
  { slug: 'furqaan', name: 'Masjid Al-Furqaan', city: 'Warren', state: 'MI', address: '27643 Schoenherr Rd' },
  { slug: 'darul-uloom', name: 'Darul Uloom Michigan', city: 'Warren', state: 'MI', address: '2446 12 Mile Rd' },
  { slug: 'mii', name: 'Michigan Islamic Institute', city: 'Warren', state: 'MI', address: '28111 Imperial Dr' },
  { slug: 'taqwa', name: 'Masjid Al-Taqwa', city: 'Warren', state: 'MI', address: '27130 Campbell Rd' },
  { slug: 'fath', name: 'Masjid Al Fath', city: 'Warren', state: 'MI', address: '24703 Ryan Rd' },
  { slug: 'mcm', name: 'MCM Masjid', city: 'Sterling Heights', state: 'MI', address: '38810 Ryan Rd' },
  { slug: 'amda', name: 'AMDA', city: 'Sterling Heights', state: 'MI', address: '44760 Ryan Rd' },
];
/** Posted Furqaan Maghrib iqamah is “10 minutes after sunset”, not a clock time.
 *  AthanPlus monthly sheets print Sunset; iqamah is sunset + 5. */
const MAGHRIB_IQAMAH_AFTER_SUNSET_MIN: Record<string, number> = {
  furqaan: 10,
  'darul-uloom': 5,
  mii: 5,
  taqwa: 5,
  fath: 5,
  mcm: 5,
  amda: 5,
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
    const cached = this.mergeKnownMosques(this.readListCache());
    const remote$ = this.http.get<MosqueOption[]>('/api/mosques').pipe(
      map((rows) => this.mergeKnownMosques(this.normalizeList(rows))),
      tap((list) => {
        if (list.length) this.writeListCache(list);
      }),
      catchError(() => of(cached))
    );
    return remote$.pipe(startWith(cached));
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
      catchError(() => (stale ? of(stale) : EMPTY))
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

  /** Names people actually use on the iqamah column (not just the first word). */
  private static readonly COLUMN_LABELS: Record<string, string> = {
    iona: 'IONA',
    furqaan: 'AL FURQAAN',
    'darul-uloom': 'DARUL ULOOM MI',
    mii: 'MII',
    taqwa: 'AL TAQWA',
    fath: 'AL FATH',
    mcm: 'MCM',
    amda: 'AMDA',
  };

  /** Short kiosk label for the iqamah column header (fits like STARTS). */
  columnLabel(name?: string, slug?: string): string {
    const known = slug ? MosqueIqamahService.COLUMN_LABELS[slug] : undefined;
    if (known) return known;
    const cleaned = (name || '')
      .replace(/\b(masjid|mosque|islamic (center|institute)( of)?)\b/gi, ' ')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (cleaned || slug || 'IQAMAH').toUpperCase();
  }

  mosqueOptionLabel(mosque: MosqueOption): string {
    const place = [mosque.city, mosque.state].filter((part) => !!part?.trim()).join(', ');
    const street = mosque.address?.trim();
    if (place && street) return `${mosque.name}, ${place} — ${street}`;
    if (place) return `${mosque.name}, ${place}`;
    if (street) return `${mosque.name} — ${street}`;
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
      maghrib: this.maghribIqamah(source, today.maghrib),
      isha: today.isha?.iqamah ?? undefined,
    };
  }

  private maghribIqamah(source: string, pair?: TimePair): string | undefined {
    const extra = MAGHRIB_IQAMAH_AFTER_SUNSET_MIN[source];
    if (extra != null && pair?.adhan) {
      return this.addMinutes(pair.adhan, extra);
    }
    return pair?.iqamah ?? undefined;
  }

  private addMinutes(value: string, minutes: number): string | undefined {
    const [hRaw, mRaw] = value.split(':');
    const hour = Number(hRaw);
    const minute = Number(mRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
    const total = hour * 60 + minute + minutes;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const mm = String(wrapped % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** Keep known masjids visible if a stale CDN/API list only has IONA + Furqaan. */
  private mergeKnownMosques(rows: MosqueOption[]): MosqueOption[] {
    const bySlug = new Map<string, MosqueOption>();
    for (const row of rows) {
      if (row?.slug) bySlug.set(row.slug, row);
    }
    const merged: MosqueOption[] = [];
    for (const known of FALLBACK_MOSQUES) {
      const remote = bySlug.get(known.slug);
      merged.push(remote ? this.fillFromKnown(known, remote) : known);
      bySlug.delete(known.slug);
    }
    for (const extra of bySlug.values()) {
      merged.push(extra);
    }
    return merged;
  }

  private fillFromKnown(known: MosqueOption, remote: MosqueOption): MosqueOption {
    return {
      slug: remote.slug,
      name: remote.name || known.name,
      city: remote.city || known.city,
      state: remote.state || known.state,
      address: remote.address || known.address,
    };
  }

  private normalizeList(rows: MosqueOption[] | null | undefined): MosqueOption[] {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => isMosqueSlug(row?.slug) && typeof row?.name === 'string' && row.name.trim())
      .map((row) => {
        const mosque: MosqueOption = { slug: row.slug, name: row.name.trim() };
        if (typeof row.city === 'string' && row.city.trim()) mosque.city = row.city.trim();
        if (typeof row.state === 'string' && row.state.trim()) mosque.state = row.state.trim();
        if (typeof row.address === 'string' && row.address.trim()) mosque.address = row.address.trim();
        return mosque;
      });
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
      const previous = localStorage.getItem(TIMES_CACHE_KEY_V2);
      if (previous) {
        const parsed = JSON.parse(previous) as StoredDays;
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
