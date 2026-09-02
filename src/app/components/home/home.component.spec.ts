import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HomeComponent } from './home.component';
import { PrayerTimesService } from '../../services/prayer-times.service';
import { SettingsService, PrayerSettings } from '../../services/settings.service';
import { WeatherService } from '../../services/weather.service';
import { GeolocationService } from '../../services/geolocation.service';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  const settingsWithCoords: PrayerSettings = {
    coords: { lat: 42.3314, lng: -83.0458 },
    method: 'ISNA',
    asr: 'Hanafi',
    timezone: 'America/Detroit',
    panelLeft: true,
    nightMode: 'off',
    screenLayout: 'landscape',
    clockPanelScale: { date: 1, temp: 1, clock: 1, clockDouble: 1, countdown: 1, sun: 1 },
    prayerPanelScale: { names: 1, times: 1, labels: 1 },
    dayClockColor: 'black',
    nightClockColor: 'amber',
    colorRotation: 'off',
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
            isNightActive: () => false,
            clockColorHex: () => '#111',
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
});
