import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { PrayTimeMethod } from '../../lib/praytime';
import { CITIES, OTHER_CITY_ID } from '../../data/cities';
import { GeoError, GeolocationService } from '../../services/geolocation.service';
import {
  AsrMethod,
  ClockPanelScale,
  ColorRotation,
  DayClockColor,
  DEFAULT_CLOCK_PANEL_SCALE,
  DEFAULT_PRAYER_PANEL_SCALE,
  FajrAngleOption,
  IshaAngleOption,
  NightClockColor,
  NightMode,
  PANEL_SCALE_MAX,
  PANEL_SCALE_MIN,
  PANEL_SCALE_STEP,
  PrayerPanelScale,
  PrayerSettings,
  ScreenLayout,
  SettingsService,
} from '../../services/settings.service';

type SizingStudio = 'clock' | 'prayer';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly geolocation = inject(GeolocationService);

  /** 'loading' while requesting, null when idle, message when error */
  geoStatus: 'loading' | null | string = null;

  readonly methodOptions: Array<{ value: PrayTimeMethod; label: string }> = [
    { value: 'ISNA', label: 'ISNA (North America — Fajr 15°, Isha 15°)' },
    { value: 'MWL', label: 'MWL (Muslim World League — Fajr 18°, Isha 17°)' },
    { value: 'Egypt', label: 'Egyptian General Authority (Fajr 19.5°, Isha 17.5°)' },
    { value: 'Makkah', label: 'Umm al-Qura (Makkah — Fajr 18.5°, Isha 90 min)' },
    { value: 'Karachi', label: 'Karachi (Fajr 18°, Isha 18°)' },
    { value: 'Singapore', label: 'Singapore (Fajr 20°, Isha 18°)' },
    { value: 'France', label: 'France (Fajr 12°, Isha 12°)' },
    { value: 'Russia', label: 'Russia (Fajr 16°, Isha 15°)' },
    { value: 'Tehran', label: 'Tehran' },
    { value: 'Jafari', label: 'Jafari' },
  ];

  readonly asrOptions: Array<{ value: AsrMethod; label: string }> = [
    { value: 'Hanafi', label: 'Hanafi' },
    { value: 'Standard', label: 'Standard' },
  ];

  readonly fajrAngleOptions: Array<{ value: FajrAngleOption; label: string }> = [
    { value: 'method', label: 'From calculation method' },
    { value: 15, label: '15°' },
    { value: 18, label: '18°' },
  ];

  readonly ishaAngleOptions: Array<{ value: IshaAngleOption; label: string }> = [
    { value: 'method', label: 'From calculation method' },
    { value: 15, label: '15°' },
    { value: 17, label: '17°' },
    { value: 18, label: '18°' },
  ];

  readonly nightModeOptions: Array<{ value: NightMode; label: string }> = [
    { value: 'auto', label: 'Automatic (dark from sunset to sunrise)' },
    { value: 'on', label: 'Always on (dark)' },
    { value: 'off', label: 'Off (normal / light)' },
  ];

  readonly colorRotationOptions: Array<{ value: ColorRotation; label: string }> = [
    { value: 'off', label: 'Off — keep chosen colors' },
    { value: 'hourly', label: 'Every hour — cycle through colors' },
  ];

  readonly screenLayoutOptions: Array<{ value: ScreenLayout; label: string }> = [
    { value: 'auto', label: 'Automatic (follow device orientation)' },
    { value: 'landscape', label: 'Landscape (wall — clock beside prayers)' },
    { value: 'portrait', label: 'Portrait (stacked — clock on top)' },
  ];

  readonly clockPanelScaleOptions: Array<{ key: keyof ClockPanelScale; label: string }> = [
    { key: 'date', label: 'Date bar' },
    { key: 'temp', label: 'Weather / temperature' },
    { key: 'clock', label: 'Main clock (1–9)' },
    { key: 'clockDouble', label: 'Main clock (10–12)' },
    { key: 'countdown', label: 'Next prayer countdown' },
    { key: 'sun', label: 'Sunrise / sunset' },
  ];

  readonly prayerPanelScaleOptions: Array<{ key: keyof PrayerPanelScale; label: string }> = [
    { key: 'names', label: 'Prayer names' },
    { key: 'times', label: 'Prayer times' },
    { key: 'labels', label: 'Column labels (Starts)' },
  ];

  readonly scaleMin = PANEL_SCALE_MIN;
  readonly scaleMax = PANEL_SCALE_MAX;
  readonly scaleStep = PANEL_SCALE_STEP;

  readonly dayClockColorOptions: Array<{ value: DayClockColor; label: string }> = [
    { value: 'black', label: 'Black' },
    { value: 'navy', label: 'Navy' },
    { value: 'charcoal', label: 'Charcoal' },
    { value: 'brown', label: 'Brown' },
    { value: 'amber', label: 'Amber' },
    { value: 'soft-gold', label: 'Soft gold' },
    { value: 'orange', label: 'Orange' },
    { value: 'coral', label: 'Coral' },
    { value: 'maroon', label: 'Maroon' },
    { value: 'rose', label: 'Rose' },
    { value: 'pink', label: 'Pink' },
    { value: 'hot-pink', label: 'Hot pink' },
    { value: 'lilac', label: 'Lilac' },
    { value: 'purple', label: 'Purple' },
    { value: 'green', label: 'Forest green' },
    { value: 'mint', label: 'Mint' },
    { value: 'teal', label: 'Teal' },
    { value: 'blue', label: 'Royal blue' },
    { value: 'sky-blue', label: 'Sky blue' },
    { value: 'navy-blue', label: 'Navy blue' },
  ];

  readonly nightClockColorOptions: Array<{ value: NightClockColor; label: string }> = [
    { value: 'amber', label: 'Amber (default)' },
    { value: 'soft-gold', label: 'Soft gold' },
    { value: 'orange', label: 'Orange' },
    { value: 'coral', label: 'Coral' },
    { value: 'led-red', label: 'LED red (alarm clock, easy from a distance)' },
    { value: 'red', label: 'Red (softer, easier on eyes at night)' },
    { value: 'rose', label: 'Rose' },
    { value: 'pink', label: 'Pink' },
    { value: 'hot-pink', label: 'Hot pink (bright)' },
    { value: 'lilac', label: 'Lilac' },
    { value: 'purple', label: 'Purple' },
    { value: 'mint', label: 'Mint' },
    { value: 'green', label: 'Green' },
    { value: 'teal', label: 'Teal' },
    { value: 'sky-blue', label: 'Sky blue' },
    { value: 'navy-blue', label: 'Navy blue' },
    { value: 'warm-white', label: 'Warm white' },
    { value: 'dim-white', label: 'Dim white' },
  ];

  readonly cities = CITIES;
  readonly otherCityId = OTHER_CITY_ID;
  readonly deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** Selected city id, or OTHER_CITY_ID for manual coordinates */
  selectedCityId: string = OTHER_CITY_ID;
  method: PrayTimeMethod = 'ISNA';
  asr: AsrMethod = 'Hanafi';
  fajrAngle: FajrAngleOption = 'method';
  ishaAngle: IshaAngleOption = 'method';
  timezone = this.deviceTimezone;
  lat = '';
  lng = '';
  /** true = clock/date panel on left */
  panelLeft = true;
  nightMode: NightMode = 'off';
  screenLayout: ScreenLayout = 'auto';
  clockPanelScale: ClockPanelScale = { ...DEFAULT_CLOCK_PANEL_SCALE };
  prayerPanelScale: PrayerPanelScale = { ...DEFAULT_PRAYER_PANEL_SCALE };
  dayClockColor: DayClockColor = 'black';
  nightClockColor: NightClockColor = 'amber';
  colorRotation: ColorRotation = 'off';
  sizingStudio: SizingStudio | null = null;

  @ViewChild('prayerPreviewFrame')
  private prayerPreviewFrame?: ElementRef<HTMLIFrameElement>;

  @ViewChild('clockPreviewFrame')
  private clockPreviewFrame?: ElementRef<HTMLIFrameElement>;

  ngOnInit(): void {
    const s = this.settingsService.getSettings();
    this.method = s.method;
    this.asr = s.asr;
    this.fajrAngle = s.fajrAngle ?? 'method';
    this.ishaAngle = s.ishaAngle ?? 'method';
    this.timezone = s.timezone;
    this.lat = s.coords?.lat?.toString() ?? '';
    this.lng = s.coords?.lng?.toString() ?? '';
    this.panelLeft = s.panelLeft ?? true;
    this.nightMode = s.nightMode ?? 'off';
    this.screenLayout = s.screenLayout ?? 'auto';
    this.clockPanelScale = { ...(s.clockPanelScale ?? DEFAULT_CLOCK_PANEL_SCALE) };
    this.prayerPanelScale = { ...(s.prayerPanelScale ?? DEFAULT_PRAYER_PANEL_SCALE) };
    this.dayClockColor = s.dayClockColor ?? 'black';
    this.nightClockColor = s.nightClockColor ?? 'amber';
    this.colorRotation = s.colorRotation ?? 'off';
    const savedCityId = s.cityId ?? OTHER_CITY_ID;
    const city = savedCityId !== OTHER_CITY_ID ? CITIES.find((c) => c.id === savedCityId) : null;
    if (city) {
      this.selectedCityId = city.id;
      this.lat = String(city.lat);
      this.lng = String(city.lng);
      this.timezone = city.timezone;
    } else {
      this.selectedCityId = OTHER_CITY_ID;
    }
  }

  onCityChange(): void {
    if (this.selectedCityId === OTHER_CITY_ID) {
      this.timezone = this.deviceTimezone;
      return;
    }
    const city = CITIES.find((c) => c.id === this.selectedCityId);
    if (city) {
      this.lat = String(city.lat);
      this.lng = String(city.lng);
      this.timezone = city.timezone;
    }
  }

  useMyLocation(): void {
    this.geoStatus = 'loading';
    this.geolocation.getCurrentPosition().subscribe({
      next: (pos) => {
        this.selectedCityId = OTHER_CITY_ID;
        this.lat = String(Math.round(pos.lat * 10000) / 10000);
        this.lng = String(Math.round(pos.lng * 10000) / 10000);
        this.timezone = this.deviceTimezone;
        this.geoStatus = null;
      },
      error: (err: GeoError) => {
        this.geoStatus =
          err === 'permission_denied'
            ? 'Location permission denied.'
            : err === 'timeout'
              ? 'Location request timed out.'
              : err === 'unsupported'
                ? 'Geolocation is not supported.'
                : 'Could not get location.';
      },
    });
  }

  clockScalePercent(key: keyof ClockPanelScale): number {
    return Math.round(this.clockPanelScale[key] * 100);
  }

  prayerScalePercent(key: keyof PrayerPanelScale): number {
    return Math.round(this.prayerPanelScale[key] * 100);
  }

  onClockScaleInput(key: keyof ClockPanelScale, percent: number): void {
    const next = Math.min(this.scaleMax, Math.max(this.scaleMin, percent / 100));
    this.clockPanelScale = {
      ...this.clockPanelScale,
      [key]: Math.round(next * 100) / 100,
    };
    this.pushClockScalePreview();
  }

  onPrayerScaleInput(key: keyof PrayerPanelScale, percent: number): void {
    const next = Math.min(this.scaleMax, Math.max(this.scaleMin, percent / 100));
    this.prayerPanelScale = {
      ...this.prayerPanelScale,
      [key]: Math.round(next * 100) / 100,
    };
    this.pushPrayerScalePreview();
  }

  onClockScaleTyped(key: keyof ClockPanelScale, raw: number | string | null): void {
    if (raw === '' || raw === null || raw === undefined) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    this.onClockScaleInput(key, num);
  }

  onPrayerScaleTyped(key: keyof PrayerPanelScale, raw: number | string | null): void {
    if (raw === '' || raw === null || raw === undefined) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    this.onPrayerScaleInput(key, num);
  }

  resetClockPanelScale(): void {
    this.clockPanelScale = { ...DEFAULT_CLOCK_PANEL_SCALE };
    this.pushClockScalePreview();
  }

  resetPrayerPanelScale(): void {
    this.prayerPanelScale = { ...DEFAULT_PRAYER_PANEL_SCALE };
    this.pushPrayerScalePreview();
  }

  openClockSizingStudio(): void {
    this.sizingStudio = 'clock';
    this.syncPreviewFrames();
  }

  openPrayerSizingStudio(): void {
    this.sizingStudio = 'prayer';
    this.pushPrayerScalePreview();
  }

  closeSizingStudio(): void {
    this.sizingStudio = null;
  }

  /** Push current settings into a preview iframe (same tab — storage events do not reach it). */
  onPreviewFrameLoad(event: Event): void {
    this.syncPreviewFrame(event.target as HTMLIFrameElement | null);
  }

  private syncPreviewFrames(): void {
    this.syncPreviewFrame(this.prayerPreviewFrame?.nativeElement ?? null);
    this.syncPreviewFrame(this.clockPreviewFrame?.nativeElement ?? null);
  }

  private syncPreviewFrame(iframe: HTMLIFrameElement | null): void {
    const settings = this.settingsService.getSettings();
    iframe?.contentWindow?.postMessage(
      {
        type: 'prayer-settings-sync',
        settings,
      },
      window.location.origin
    );
  }

  private pushClockScalePreview(): void {
    this.settingsService.previewClockPanelScale(this.clockPanelScale);
    this.syncPreviewFrames();
  }

  private pushPrayerScalePreview(): void {
    this.settingsService.previewPrayerPanelScale(this.prayerPanelScale);
    this.syncPreviewFrames();
  }

  reloadDisplay(): void {
    window.location.assign('/');
  }

  save(): void {
    let coords: PrayerSettings['coords'];
    let timezone = this.timezone;
    let cityId: string | undefined;
    if (this.selectedCityId !== OTHER_CITY_ID) {
      const city = CITIES.find((c) => c.id === this.selectedCityId);
      if (city) {
        coords = { lat: city.lat, lng: city.lng };
        timezone = city.timezone;
        cityId = city.id;
      } else {
        coords = this.parseCoords();
        cityId = undefined;
      }
    } else {
      coords = this.parseCoords();
      cityId = undefined;
    }
    const next: PrayerSettings = {
      coords,
      method: this.method,
      asr: this.asr,
      fajrAngle: this.fajrAngle,
      ishaAngle: this.ishaAngle,
      timezone,
      panelLeft: this.panelLeft,
      nightMode: this.nightMode,
      screenLayout: this.screenLayout,
      clockPanelScale: { ...this.clockPanelScale },
      prayerPanelScale: { ...this.prayerPanelScale },
      dayClockColor: this.dayClockColor,
      nightClockColor: this.nightClockColor,
      colorRotation: this.colorRotation,
      cityId,
    };
    this.settingsService.saveSettings(next);
    window.location.assign('/');
  }

  private parseCoords(): PrayerSettings['coords'] {
    const lat = Number(this.lat);
    const lng = Number(this.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;
    return { lat, lng };
  }
}
