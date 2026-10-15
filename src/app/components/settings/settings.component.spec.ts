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
              ]),
            mosqueOptionLabel: (mosque: { name: string; city?: string }) =>
              mosque.city ? `${mosque.name} (${mosque.city})` : mosque.name,
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

  it('offers each masjid from the iqamah API plus Off', () => {
    expect(component.mosqueIqamahOptions.map((option) => option.value)).toEqual([
      'off',
      'iona',
      'madania',
    ]);
    expect(component.mosqueIqamahOptions[1].label).toBe('IONA Masjid (Warren)');
    expect(component.mosqueIqamahOptions[2].label).toBe('Madania Masjid (Warren)');
  });
});

