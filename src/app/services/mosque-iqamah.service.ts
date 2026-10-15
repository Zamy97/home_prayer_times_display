import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, tap } from 'rxjs/operators';

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

const TIMES_CACHE_KEY = 'mosqueIqamah.v1';
const LIST_CACHE_KEY = 'mosqueList.v1';
const FALLBACK_MOSQUES: MosqueOption[] = [
  { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
];

export function isMosqueSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value);
}

export function isMosqueIqamahSource(value: unknown): value is MosqueIqamahSource {
  return value === 'off' || isMosqueSlug(value);
}

@Injectable({ providedIn: 'root' })
export class MosqueIqamahService {
  private readonly http = inject(HttpClient);

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
    const cached = this.readTimesCache(source, date);
    const url =
      `/api/mosques/${encodeURIComponent(source)}/times` +
      `?date=${encodeURIComponent(date)}&days=0`;
    const remote$ = this.http.get<MosqueTimesResponse>(url).pipe(
      map((res) => this.fromResponse(source, res)),
      tap((times) => {
        if (times) this.writeTimesCache(source, times);
      }),
      catchError(() => of(cached))
    );
    return cached ? remote$.pipe(startWith(cached)) : remote$;
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

  private readTimesCache(source: MosqueIqamahSource, date: string): MosqueIqamahTimes | null {
    try {
      const raw = localStorage.getItem(TIMES_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MosqueIqamahTimes;
      if (parsed.slug !== source || parsed.date !== date) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeTimesCache(source: MosqueIqamahSource, times: MosqueIqamahTimes): void {
    try {
      localStorage.setItem(TIMES_CACHE_KEY, JSON.stringify({ ...times, slug: source }));
    } catch {
      // ignore quota / private mode
    }
  }
}
