import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { SettingsComponent } from './settings.component';
import { MosqueIqamahService } from '../../services/mosque-iqamah.service';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SettingsComponent],
      imports: [FormsModule, RouterTestingModule],
      providers: [
        {
          provide: MosqueIqamahService,
          useValue: {
            listMosques: () =>
              of([
                { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
                { slug: 'madania', name: 'Madania Masjid', city: 'Warren', state: 'MI' },
                { slug: 'mcm', name: 'MCM Masjid', city: 'Sterling Heights', state: 'MI' },
              ]),
            mosqueOptionLabel: (mosque: { name: string; city?: string; state?: string; address?: string }) => {
              const place = [mosque.city, mosque.state].filter(Boolean).join(', ');
              return mosque.address
                ? `${mosque.name}, ${place} — ${mosque.address}`
                : `${mosque.name}, ${place}`;
            },
            mosqueCityOptionLabel: (mosque: { name: string; address?: string }) =>
              mosque.address ? `${mosque.name} — ${mosque.address}` : mosque.name,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('slides the prayer panel toward the clock when dragged left and the clock is on the left', () => {
    component.panelLeft = true;
    component.onPrayerShiftSlider(-18);
    expect(component.prayerPanelShift).toBe(18);
    expect(component.prayerShiftSlider).toBe(-18);
  });

  it('offers location cities only after a state is chosen', () => {
    expect(component.locationState).toBe('MI');
    expect(component.locationCities.map((city) => city.cityName)).toContain('Warren');
    expect(component.locationCities.map((city) => city.cityName)).toContain('Sterling Heights');

    component.selectedCityId = 'warren-mi';
    component.onCityChange();

    expect(component.lat).toBe('42.5145');
    expect(component.lng).toBe('-83.0147');
    expect(component.timezone).toBe('America/Detroit');
  });

  it('offers city masjids only after a state and city are chosen', () => {
    expect(component.mosqueIqamahState).toBe('MI');
    expect(component.mosqueIqamahCity).toBe('');
    expect(component.mosqueIqamahCities).toEqual(['Sterling Heights', 'Warren']);
    expect(component.mosqueIqamahOptions.map((option) => option.value)).toEqual(['off']);

    component.mosqueIqamahCity = 'Warren';
    component.onMosqueCityChange();

    expect(component.mosqueIqamahOptions.map((option) => option.value)).toEqual([
      'off',
      'iona',
      'madania',
    ]);
    expect(component.mosqueIqamahOptions[1].label).toBe('IONA Masjid');
    expect(component.mosqueIqamahOptions[2].label).toBe('Madania Masjid');
  });
});

