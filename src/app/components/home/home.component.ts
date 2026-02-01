import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, startWith } from 'rxjs';
import { PrayerTimesService } from '../../services/prayer-times.service';
import { PrayTimeTimes } from '../../lib/praytime';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  nextPrayerKey: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | null = null;

  hijriDateLabel = '';
  gregDateLabel = '';

  nowTime = '';
  nowSeconds = '';
  nowAmPm = '';

  sunrise: { time: string; ampm: string } | null = null;
  sunset: { time: string; ampm: string } | null = null;
  times:
    | ({
        fajr: { time: string; ampm: string };
        dhuhr: { time: string; ampm: string };
        asr: { time: string; ampm: string };
        maghrib: { time: string; ampm: string };
        isha: { time: string; ampm: string };
      } & { raw: PrayTimeTimes<string> })
    | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly prayerTimes = inject(PrayerTimesService);
  private readonly settingsService = inject(SettingsService);
  private settings = this.settingsService.getSettings();
  private lastDateKey = this.prayerTimes.getLocalDateKey();
  private prayerInstants: Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>> = {};

  private readonly timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  private readonly gregDateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // Hijri date via Intl (Islamic calendar). Month name depends on locale data.
  private readonly hijriDateFormatter = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
    month: 'long',
    day: 'numeric',
  });

  ngOnInit(): void {
    this.updateDateLabels(new Date());

    interval(1000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setNow(new Date()));

    // Recompute any time settings change (e.g. user saved new method/coords).
    this.settingsService.settings$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        this.settings = s;
        this.loadFromCache();
        this.loadPrayerTimes();
      });

    // 3) Recompute when the day changes (robust for 24/7 screens)
    interval(5 * 60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshIfDateChanged());

    // 4) Also refresh when tab becomes visible or focused (covers sleep/DST/throttling)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') this.refreshIfDateChanged(true);
    };
    const onFocus = () => this.refreshIfDateChanged(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    });
  }

  private refreshIfDateChanged(force = false): void {
    const currentKey = this.prayerTimes.getLocalDateKey();
    if (!force && currentKey === this.lastDateKey) return;
    if (currentKey !== this.lastDateKey) {
      this.lastDateKey = currentKey;
      this.updateDateLabels(new Date());
    }
    this.loadPrayerTimes();
  }

  private loadFromCache(): void {
    const cached = this.prayerTimes.getCachedTodayTimes(this.settings);
    if (!cached) return;
    this.applyTimes(cached.times);
  }

  private loadPrayerTimes(): void {
    // Primary: use configured coords from /settings.
    if (this.settings.coords) {
      const { times: raw } = this.prayerTimes.computeAndCacheTodayTimes(this.settings);
      this.applyTimes(raw);
      return;
    }

    // Fallback: attempt geolocation once, and save it into settings (so it becomes stable).
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          ...this.settings,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        };
        this.settingsService.saveSettings(next);
      },
      () => {
        // no-op
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 10_000 },
    );
  }

  private applyTimes(raw: PrayTimeTimes<string>): void {
    const sunrise = this.splitTime(raw.sunrise);
    const sunset = this.splitTime(raw.sunset);

    this.sunrise = sunrise;
    this.sunset = sunset;

    this.times = {
      fajr: this.splitTime(raw.fajr),
      dhuhr: this.splitTime(raw.dhuhr),
      asr: this.splitTime(raw.asr),
      maghrib: this.splitTime(raw.maghrib),
      isha: this.splitTime(raw.isha),
      raw,
    };

    // Pre-compute today's prayer instants for fast "next prayer" lookup.
    const today = new Date();
    this.prayerInstants = {
      fajr: this.parseTimeToEpoch(raw.fajr, today) ?? undefined,
      dhuhr: this.parseTimeToEpoch(raw.dhuhr, today) ?? undefined,
      asr: this.parseTimeToEpoch(raw.asr, today) ?? undefined,
      maghrib: this.parseTimeToEpoch(raw.maghrib, today) ?? undefined,
      isha: this.parseTimeToEpoch(raw.isha, today) ?? undefined,
    };
    this.updateNextPrayer(new Date());
  }

  private splitTime(value: string): { time: string; ampm: string } {
    // Expect formats like "5:27 AM"
    const match = value.trim().match(/^(.+?)\s*([AP]M)$/i);
    if (!match) return { time: value, ampm: '' };
    return { time: match[1], ampm: match[2].toUpperCase() };
  }

  private parseTimeToEpoch(value: string, baseDate: Date): number | null {
    // Expects formats like "5:27 AM" (from PrayTime formatting).
    const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return null;

    const hour12 = Number(match[1]);
    const minute = Number(match[2]);
    const ampm = match[3].toUpperCase();

    let hour24 = hour12 % 12;
    if (ampm === 'PM') hour24 += 12;

    const dt = new Date(baseDate);
    dt.setHours(hour24, minute, 0, 0);
    return dt.getTime();
  }

  private updateNextPrayer(now: Date): void {
    const order: Array<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'> = [
      'fajr',
      'dhuhr',
      'asr',
      'maghrib',
      'isha',
    ];

    const nowMs = now.getTime();
    for (const key of order) {
      const t = this.prayerInstants[key];
      if (typeof t === 'number' && nowMs < t) {
        this.nextPrayerKey = key;
        return;
      }
    }

    // If we're after Isha, the next prayer is Fajr (tomorrow).
    this.nextPrayerKey = 'fajr';
  }

  private updateDateLabels(date: Date): void {
    // Gregorian label like: "SUNDAY, DEC 8"
    const gParts = this.gregDateFormatter.formatToParts(date);
    const weekday = gParts.find((p) => p.type === 'weekday')?.value ?? '';
    const month = gParts.find((p) => p.type === 'month')?.value ?? '';
    const day = gParts.find((p) => p.type === 'day')?.value ?? '';
    this.gregDateLabel = `${weekday.toUpperCase()}, ${month.toUpperCase()} ${day}`;

    // Hijri label like: "RABIʻ AL-THANI 11" (varies by locale/calendar data)
    const hParts = this.hijriDateFormatter.formatToParts(date);
    const hMonth = (hParts.find((p) => p.type === 'month')?.value ?? '').replace(/[-]/g, ' ');
    const hDay = hParts.find((p) => p.type === 'day')?.value ?? '';
    this.hijriDateLabel = `${hMonth.toUpperCase()} ${hDay}`.trim();
  }

  private setNow(date: Date): void {
    const parts = this.timeFormatter.formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
    const second = parts.find((p) => p.type === 'second')?.value ?? '';
    const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';

    this.nowTime = `${hour}:${minute}`;
    this.nowSeconds = second;
    this.nowAmPm = dayPeriod;

    // Ensure date/prayer-times switch over immediately at midnight.
    const currentKey = this.prayerTimes.getLocalDateKey(date);
    if (currentKey !== this.lastDateKey) {
      this.lastDateKey = currentKey;
      this.updateDateLabels(date);
      this.loadPrayerTimes();
      return;
    }

    // Update next-prayer highlight as time passes.
    if (this.times?.raw) this.updateNextPrayer(date);
  }
}

