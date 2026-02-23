import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PrayTimeMethod } from '../../lib/praytime';
import { CITIES, OTHER_CITY_ID } from '../../data/cities';
import { GeoError, GeolocationService } from '../../services/geolocation.service';
import { AsrMethod, PrayerSettings, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly router = inject(Router);

  /** 'loading' while requesting, null when idle, message when error */
  geoStatus: 'loading' | null | string = null;

  readonly methodOptions: Array<{ value: PrayTimeMethod; label: string }> = [
    { value: 'ISNA', label: 'ISNA (North America)' },
    { value: 'MWL', label: 'MWL (Muslim World League)' },
    { value: 'Egypt', label: 'Egyptian General Authority' },
    { value: 'Makkah', label: 'Umm al-Qura (Makkah)' },
    { value: 'Karachi', label: 'Karachi' },
    { value: 'Singapore', label: 'Singapore' },
    { value: 'France', label: 'France' },
    { value: 'Russia', label: 'Russia' },
    { value: 'Tehran', label: 'Tehran' },
    { value: 'Jafari', label: 'Jafari' },
  ];

  readonly asrOptions: Array<{ value: AsrMethod; label: string }> = [
    { value: 'Hanafi', label: 'Hanafi' },
    { value: 'Standard', label: 'Standard' },
  ];

  readonly cities = CITIES;
  readonly otherCityId = OTHER_CITY_ID;
  readonly deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** Selected city id, or OTHER_CITY_ID for manual coordinates */
  selectedCityId: string = OTHER_CITY_ID;
  method: PrayTimeMethod = 'ISNA';
  asr: AsrMethod = 'Hanafi';
  timezone = this.deviceTimezone;
  lat = '';
  lng = '';
  /** true = clock/date panel on left */
  panelLeft = true;

  ngOnInit(): void {
    const s = this.settingsService.getSettings();
    this.method = s.method;
    this.asr = s.asr;
    this.timezone = s.timezone;
    this.lat = s.coords?.lat?.toString() ?? '';
    this.lng = s.coords?.lng?.toString() ?? '';
    this.panelLeft = s.panelLeft ?? true;
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
      timezone,
      panelLeft: this.panelLeft,
      cityId,
    };
    this.settingsService.saveSettings(next);
    this.router.navigate(['/']);
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

