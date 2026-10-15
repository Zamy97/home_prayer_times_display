import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { HomeComponent } from './home.component';
import { PrayerTimesService } from '../../services/prayer-times.service';
import { SettingsService, PrayerSettings } from '../../services/settings.service';
import { WeatherService } from '../../services/weather.service';
import { GeolocationService } from '../../services/geolocation.service';
import { HijriDateService } from '../../services/hijri-date.service';
import { MosqueIqamahService } from '../../services/mosque-iqamah.service';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  const settingsWithCoords: PrayerSettings = {
    coords: { lat: 42.3314, lng: -83.0458 },
    method: 'ISNA',
    asr: 'Hanafi',
    fajrAngle: 'method',
    ishaAngle: 'method',
    timezone: 'America/Detroit',
    panelLeft: true,
    prayerPanelShift: 0,
    nightMode: 'off',
    sleepMode: 'off',
    prayerBanAlert: true,
    sleepModeScale: { clock: 1, clockDouble: 1, facts: 1, labels: 1 },
    screenLayout: 'landscape',
    clockPanelScale: { date: 1, temp: 1, clock: 1, clockDouble: 1, countdown: 1, sun: 1 },
    prayerPanelScale: { names: 1, times: 1, labels: 1 },
    dayClockColor: 'black',
    nightClockColor: 'amber',
    dayBackground: 'white',
    nightBackground: 'black',
    simpleDayClockColor: 'black',
    simpleNightClockColor: 'amber',
    simpleDayBackground: 'white',
    simpleNightBackground: 'black',
    colorRotation: 'off',
    mosqueIqamahSource: 'iona',
  };

  const settingsSubject = new BehaviorSubject<PrayerSettings>(settingsWithCoords);

  beforeEach(async () => {
    settingsSubject.next(settingsWithCoords);

    await TestBed.configureTestingModule({
      declarations: [HomeComponent],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            settings$: settingsSubject.asObservable(),
            getSettings: () => settingsSubject.value,
            saveSettings: jasmine.createSpy('saveSettings'),
            setSunTimes: jasmine.createSpy('setSunTimes'),
            setSleepIshaAtMs: jasmine.createSpy('setSleepIshaAtMs'),
            isNightActive: () => false,
            isSleepModeActive: () => false,
            isOvernightSleepWindow: () => false,
            isDaytimeBySun: () => true,
            clockColorHex: () => '#111',
            boardBackgroundHex: () => '#fff',
            clockOnDarkHex: () => '#fff',
          },
        },
        {
          provide: PrayerTimesService,
          useValue: {
            getLocalDateKey: () => '2026-08-31',
            getCachedTodayTimes: () => null,
            computeAndCacheTodayTimes: () => ({
              times: {
                fajr: '5:30 AM',
                dhuhr: '1:15 PM',
                asr: '4:45 PM',
                maghrib: '7:50 PM',
                isha: '9:15 PM',
                sunrise: '6:45 AM',
                sunset: '7:40 PM',
              },
            }),
            computeTimes: () => ({
              fajr: '5:31 AM',
              dhuhr: '1:15 PM',
              asr: '4:45 PM',
              maghrib: '7:50 PM',
              isha: '9:15 PM',
              sunrise: '6:46 AM',
              sunset: '7:40 PM',
            }),
          },
        },
        {
          provide: WeatherService,
          useValue: { getCurrentWeather: () => ({ subscribe: () => undefined }) },
        },
        {
          provide: GeolocationService,
          useValue: { getCurrentPosition: () => ({ subscribe: () => undefined }) },
        },
        {
          provide: HijriDateService,
          useValue: {
            ensureCalendar: () => of(null),
            refresh: () => of(null),
            formatForDate: () => ({
              day: 21,
              monthIndex: 3,
              monthName: 'Rabi al-Awwal',
              year: 1448,
              label: 'RABI AL-AWWAL 21',
              source: 'chc',
            }),
          },
        },
        {
          provide: MosqueIqamahService,
          useValue: {
            loadToday: () =>
              of({
                slug: 'iona',
                name: 'IONA Masjid',
                date: '2026-10-14',
                fajr: '06:45',
                dhuhr: '14:00',
                asr: '17:30',
                maghrib: '19:00',
                isha: '20:30',
              }),
            columnLabel: (name?: string, slug?: string) =>
              (name || slug || 'IQAMAH').split(' ')[0].toUpperCase(),
            formatIqamah: (value?: string | null) => {
              if (!value) return null;
              const [hRaw, mRaw] = value.split(':');
              const hour24 = Number(hRaw);
              const minute = Number(mRaw);
              const ampm = hour24 >= 12 ? 'PM' : 'AM';
              const hour12 = hour24 % 12 || 12;
              return { time: `${hour12}:${String(minute).padStart(2, '0')}`, ampm };
            },
          },
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads prayer times on init so a full page reload still shows them', () => {
    expect(component.times?.fajr?.time).toBe('5:30');
    expect(component.times?.isha?.time).toBe('9:15');
  });

  it('exposes the prayer panel shift as a CSS variable', () => {
    expect(component.prayerShift).toBe('0%');
  });

  it('shows IONA iqamah in a third column next to each start time', () => {
    expect(component.showIqamahColumn).toBeTrue();
    expect(component.iqamahColumnLabel).toBe('IONA');
    expect(component.iqamah?.fajr).toEqual({ time: '6:45', ampm: 'AM' });
    expect(component.iqamah?.dhuhr).toEqual({ time: '2:00', ampm: 'PM' });
    expect(component.iqamah?.asr).toEqual({ time: '5:30', ampm: 'PM' });
    expect(component.iqamah?.maghrib).toEqual({ time: '7:00', ampm: 'PM' });
    expect(component.iqamah?.isha).toEqual({ time: '8:30', ampm: 'PM' });
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.iqamah-cell .time')
    ).map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['6:45AM', '2:00PM', '5:30PM', '7:00PM', '8:30PM']);
  });
});
