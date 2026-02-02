import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PrayTimeMethod } from '../../lib/praytime';
import { AsrMethod, PrayerSettings, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

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

  get setupLink(): string {
    const lat = Number(this.lat);
    const lng = Number(this.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    if (lat < -90 || lat > 90) return '';
    if (lng < -180 || lng > 180) return '';

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      method: this.method,
      asr: this.asr,
      timezone: this.timezone,
    });
    return `${origin}/setup?${params.toString()}`;
  }

  async copySetupLink(): Promise<void> {
    const link = this.setupLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // ignore (kiosk devices may block clipboard)
    }
  }

  ngOnInit(): void {
    const s = this.settingsService.getSettings();
    this.method = s.method;
    this.asr = s.asr;
    this.timezone = s.timezone;
    this.lat = s.coords?.lat?.toString() ?? '';
    this.lng = s.coords?.lng?.toString() ?? '';
  }

  save(): void {
    const coords = this.parseCoords();
    const next: PrayerSettings = {
      coords,
      method: this.method,
      asr: this.asr,
      timezone: this.timezone,
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

