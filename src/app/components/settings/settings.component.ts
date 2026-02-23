import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PrayTimeMethod } from '../../lib/praytime';
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

  method: PrayTimeMethod = 'ISNA';
  asr: AsrMethod = 'Hanafi';
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  }

  useMyLocation(): void {
    this.geoStatus = 'loading';
    this.geolocation.getCurrentPosition().subscribe({
      next: (pos) => {
        this.lat = String(Math.round(pos.lat * 10000) / 10000);
        this.lng = String(Math.round(pos.lng * 10000) / 10000);
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
    const coords = this.parseCoords();
    const next: PrayerSettings = {
      coords,
      method: this.method,
      asr: this.asr,
      timezone: this.timezone,
      panelLeft: this.panelLeft,
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

