import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PrayTimeMethod } from '../../lib/praytime';
import { AsrMethod, PrayerSettings, SettingsService } from '../../services/settings.service';

type SetupState =
  | { kind: 'working'; message: string }
  | { kind: 'error'; message: string; details?: string };

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css'],
})
export class SetupComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly settingsService = inject(SettingsService);

  state: SetupState = { kind: 'working', message: 'Applying setup link…' };

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;

    const lat = this.parseNumber(qp.get('lat') ?? qp.get('latitude'));
    const lng = this.parseNumber(qp.get('lng') ?? qp.get('lon') ?? qp.get('longitude'));

    if (lat == null || lng == null) {
      this.state = {
        kind: 'error',
        message: 'Missing or invalid coordinates in setup link.',
        details: 'Expected query params: lat and lng (e.g. /setup?lat=42.48&lng=-83.02)',
      };
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      this.state = {
        kind: 'error',
        message: 'Coordinates are out of range.',
        details: 'Latitude must be between -90 and 90, longitude between -180 and 180.',
      };
      return;
    }

    const current = this.settingsService.getSettings();
    const method = this.parseMethod(qp.get('method')) ?? current.method;
    const asr = this.parseAsr(qp.get('asr')) ?? current.asr;
    const timezone = (qp.get('timezone') ?? qp.get('tz') ?? current.timezone).trim();

    const next: PrayerSettings = {
      coords: { lat, lng },
      method,
      asr,
      timezone,
    };

    this.settingsService.saveSettings(next);
    this.state = { kind: 'working', message: 'Saved. Redirecting to home…' };
    void this.router.navigate(['/']);
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

