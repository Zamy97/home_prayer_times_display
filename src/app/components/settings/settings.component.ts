import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PrayTimeMethod } from '../../lib/praytime';
import { AsrMethod, PrayerSettings, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
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
  /** true = clock/date panel on left */
  panelLeft = true;

  // If the page is opened as a "setup link", we apply query params and redirect home.
  private didHandleLink = false;

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
    return `${origin}/settings?${params.toString()}`;
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
    this.panelLeft = s.panelLeft ?? true;

    // Handle "setup via link" on /settings?lat=...&lng=...
    const qp = this.route.snapshot.queryParamMap;
    const latRaw = qp.get('lat') ?? qp.get('latitude');
    const lngRaw = qp.get('lng') ?? qp.get('lon') ?? qp.get('longitude');
    if (latRaw != null || lngRaw != null) {
      void this.applyLinkParamsAndRedirect();
    }
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

  private async applyLinkParamsAndRedirect(): Promise<void> {
    if (this.didHandleLink) return;
    this.didHandleLink = true;

    const qp = this.route.snapshot.queryParamMap;
    const lat = this.parseNumber(qp.get('lat') ?? qp.get('latitude'));
    const lng = this.parseNumber(qp.get('lng') ?? qp.get('lon') ?? qp.get('longitude'));

    if (lat == null || lng == null) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    const current = this.settingsService.getSettings();
    const method = this.parseMethod(qp.get('method')) ?? current.method;
    const asr = this.parseAsr(qp.get('asr')) ?? current.asr;
    const timezone = (qp.get('timezone') ?? qp.get('tz') ?? current.timezone).trim();

    const next: PrayerSettings = {
      coords: { lat, lng },
      method,
      asr,
      timezone,
      panelLeft: current.panelLeft ?? true,
    };

    this.settingsService.saveSettings(next);
    await this.router.navigate(['/'], { replaceUrl: true });
  }

  private parseNumber(raw: string | null): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private parseMethod(raw: string | null): PrayTimeMethod | null {
    if (!raw) return null;
    const allowed: PrayTimeMethod[] = [
      'ISNA',
      'MWL',
      'Egypt',
      'Makkah',
      'Karachi',
      'Singapore',
      'France',
      'Russia',
      'Tehran',
      'Jafari',
    ];
    return allowed.includes(raw as PrayTimeMethod) ? (raw as PrayTimeMethod) : null;
  }

  private parseAsr(raw: string | null): AsrMethod | null {
    if (!raw) return null;
    return raw === 'Hanafi' || raw === 'Standard' ? (raw as AsrMethod) : null;
  }
}

