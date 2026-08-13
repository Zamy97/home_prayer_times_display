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
  }

  private syncDocumentNight(): void {
    document.documentElement.classList.toggle('night', this.settingsService.isNightActive());
  }
}
