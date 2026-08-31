import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, startWith } from 'rxjs';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Home Prayer Times Display';

  private readonly settingsService = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    // Keep <html class="night"> in sync on every route (including /settings)
    // so the page doesn't flash white after leaving the home screen.
    this.settingsService.settings$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDocumentNight());

    interval(30_000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDocumentNight());

    // Pick up new Vercel / kiosk builds without rebooting the device.
    interval(30 * 60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkForDeployUpdate());
  }

  private readonly deployScriptId = this.readDeployScriptId();

  private readDeployScriptId(html?: string): string | null {
    const source = html ?? document.documentElement.outerHTML;
    return source.match(/main-[A-Z0-9]+\.js/)?.[0] ?? null;
  }

  private checkForDeployUpdate(): void {
    if (!this.deployScriptId || document.visibilityState === 'hidden') return;

    fetch(`${window.location.origin}/index.html?deploy-check=${Date.now()}`, {
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (!html) return;
        const latest = this.readDeployScriptId(html);
        if (latest && latest !== this.deployScriptId) {
          window.location.reload();
        }
      })
      .catch(() => undefined);
  }

  private syncDocumentNight(): void {
    document.documentElement.classList.toggle('night', this.settingsService.isNightActive());
  }
}
