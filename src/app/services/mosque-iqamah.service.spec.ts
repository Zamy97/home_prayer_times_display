import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MosqueIqamahService } from './mosque-iqamah.service';

describe('MosqueIqamahService', () => {
  let service: MosqueIqamahService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('mosqueIqamah.v1');
    localStorage.removeItem('mosqueList.v1');
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(MosqueIqamahService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('mosqueIqamah.v1');
    localStorage.removeItem('mosqueList.v1');
  });

  it('formats 24-hour iqamah as 12-hour split time', () => {
    expect(service.formatIqamah('06:45')).toEqual({ time: '6:45', ampm: 'AM' });
    expect(service.formatIqamah('14:00')).toEqual({ time: '2:00', ampm: 'PM' });
    expect(service.formatIqamah('00:05')).toEqual({ time: '12:05', ampm: 'AM' });
    expect(service.formatIqamah(null)).toBeNull();
  });

  it('returns null when overlay is off', () => {
    let result: unknown = 'unset';
    service.loadToday('off').subscribe((times) => (result = times));
    expect(result).toBeNull();
  });

  it('shortens mosque names for the iqamah column header', () => {
    expect(service.columnLabel('IONA Masjid', 'iona')).toBe('IONA');
    expect(service.columnLabel('Madania Masjid', 'madania')).toBe('MADANIA');
  });

  it('lists masjids from the mosque API', () => {
    let result: unknown;
    service.listMosques().subscribe((mosques) => {
      result = mosques;
    });
    const req = http.expectOne('/api/mosques');
    req.flush([
      { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
      { slug: 'madania', name: 'Madania Masjid', city: 'Warren', state: 'MI' },
    ]);
    expect(result).toEqual([
      { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
      { slug: 'madania', name: 'Madania Masjid', city: 'Warren', state: 'MI' },
    ]);
  });

  it('maps IONA today iqamah from the mosque API', () => {
    let result: unknown;
    service.loadToday('iona', '2026-10-14').subscribe((times) => {
      result = times;
    });
    const req = http.expectOne('/api/mosques/iona/times?date=2026-10-14&days=0');
    req.flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: {
        date: '2026-10-14',
        fajr: { adhan: '06:12', iqamah: '06:45' },
        dhuhr: { adhan: '13:23', iqamah: '14:00' },
        asr: { iqamah: '17:30' },
        maghrib: { adhan: '18:55', iqamah: '19:00' },
        isha: { adhan: '20:13', iqamah: '20:30' },
      },
    });
    expect(result).toEqual(
      jasmine.objectContaining({
        slug: 'iona',
        date: '2026-10-14',
        fajr: '06:45',
        dhuhr: '14:00',
        asr: '17:30',
        maghrib: '19:00',
        isha: '20:30',
      })
    );
  });
});
