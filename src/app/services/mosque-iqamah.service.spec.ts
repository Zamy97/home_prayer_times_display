import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MosqueIqamahService } from './mosque-iqamah.service';

describe('MosqueIqamahService', () => {
  let service: MosqueIqamahService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('mosqueIqamah.v1');
    localStorage.removeItem('mosqueIqamah.v2');
    localStorage.removeItem('mosqueIqamah.v3');
    localStorage.removeItem('mosqueList.v1');
    localStorage.removeItem('mosqueList.v2');
    localStorage.removeItem('mosqueList.v3');
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(MosqueIqamahService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('mosqueIqamah.v1');
    localStorage.removeItem('mosqueIqamah.v2');
    localStorage.removeItem('mosqueIqamah.v3');
    localStorage.removeItem('mosqueList.v1');
    localStorage.removeItem('mosqueList.v2');
    localStorage.removeItem('mosqueList.v3');
  });

  it('formats 24-hour iqamah as 12-hour split time', () => {
    expect(service.formatIqamah('06:45')).toEqual({ time: '6:45', ampm: 'AM' });
    expect(service.formatIqamah('14:00')).toEqual({ time: '2:00', ampm: 'PM' });
    expect(service.formatIqamah('00:05')).toEqual({ time: '12:05', ampm: 'AM' });
    expect(service.formatIqamah(null)).toBeNull();
  });

  it('uses sunset plus 10 minutes for Furqaan Maghrib when the sheet is blank', () => {
    const sunset = new Date(2026, 9, 16, 18, 48, 0, 0).getTime();
    expect(service.resolveMaghribIqamah('furqaan', null, sunset)).toEqual({
      time: '6:58',
      ampm: 'PM',
    });
    expect(service.resolveMaghribIqamah('furqaan', undefined, sunset)).toEqual({
      time: '6:58',
      ampm: 'PM',
    });
  });

  it('keeps a posted Maghrib iqamah and does not invent one for other masjids', () => {
    const sunset = new Date(2026, 9, 16, 18, 48, 0, 0).getTime();
    expect(service.resolveMaghribIqamah('iona', '19:00', sunset)).toEqual({
      time: '7:00',
      ampm: 'PM',
    });
    expect(service.resolveMaghribIqamah('iona', null, sunset)).toBeNull();
    expect(service.resolveMaghribIqamah('furqaan', null, null)).toBeNull();
  });

  it('returns null when overlay is off', () => {
    let result: unknown = 'unset';
    service.loadToday('off').subscribe((times) => (result = times));
    expect(result).toBeNull();
  });

  it('labels dropdown options with city, state, and street', () => {
    expect(
      service.mosqueOptionLabel({
        slug: 'iona',
        name: 'IONA Masjid',
        city: 'Warren',
        state: 'MI',
        address: '28630 Ryan Rd',
      })
    ).toBe('IONA Masjid, Warren, MI — 28630 Ryan Rd');
    expect(
      service.mosqueOptionLabel({ slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' })
    ).toBe('IONA Masjid, Warren, MI');
  });

  it('uses familiar short names on the iqamah column header', () => {
    expect(service.columnLabel('IONA Masjid', 'iona')).toBe('IONA');
    expect(service.columnLabel('Michigan Islamic Institute', 'mii')).toBe('MII');
    expect(service.columnLabel('Masjid Al Fath', 'fath')).toBe('AL FATH');
    expect(service.columnLabel('Darul Uloom Michigan', 'darul-uloom')).toBe('DARUL ULOOM MI');
    expect(service.columnLabel('Masjid Al-Taqwa', 'taqwa')).toBe('AL TAQWA');
    expect(service.columnLabel('Masjid Al-Furqaan', 'furqaan')).toBe('AL FURQAAN');
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
    const listed = result as Array<{ slug: string; name: string; city?: string; state?: string; address?: string }>;
    expect(listed.map((mosque) => mosque.slug)).toEqual([
      'iona',
      'furqaan',
      'darul-uloom',
      'mii',
      'taqwa',
      'fath',
      'madania',
    ]);
    expect(listed[0].address).toBe('28630 Ryan Rd');
    expect(listed[6]).toEqual({ slug: 'madania', name: 'Madania Masjid', city: 'Warren', state: 'MI' });
  });

  it('keeps known masjids when the API list is a stale two-mosque roster', () => {
    let result: unknown;
    service.listMosques().subscribe((mosques) => {
      result = mosques;
    });
    http.expectOne('/api/mosques').flush([
      { slug: 'iona', name: 'IONA Masjid', city: 'Warren', state: 'MI' },
      { slug: 'furqaan', name: 'Masjid Al-Furqaan', city: 'Warren', state: 'MI' },
    ]);
    expect((result as Array<{ slug: string }>).map((mosque) => mosque.slug)).toEqual([
      'iona',
      'furqaan',
      'darul-uloom',
      'mii',
      'taqwa',
      'fath',
    ]);
  });

  it('uses AthanPlus Maghrib adhan plus 5 minutes even if stored iqamah is sunset', () => {
    let result: unknown;
    service.loadToday('mii', '2026-10-16').subscribe((times) => {
      result = times;
    });
    http.expectOne('/api/mosques/mii/times?date=2026-10-16&days=0').flush({
      mosque: { slug: 'mii', name: 'Michigan Islamic Institute' },
      today: {
        date: '2026-10-16',
        maghrib: { adhan: '18:48', iqamah: '18:48' },
      },
    });
    expect(result).toEqual(jasmine.objectContaining({ maghrib: '18:53' }));
    http.expectOne('/api/mosques/mii/times?date=2026-10-17&days=0').flush({
      mosque: { slug: 'mii', name: 'Michigan Islamic Institute' },
      today: { date: '2026-10-17' },
    });
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
    http.expectOne('/api/mosques/iona/times?date=2026-10-15&days=0').flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: { date: '2026-10-15', fajr: { iqamah: '06:46' } },
    });
  });

  it('shows yesterday immediately, then swaps in today and saves tomorrow', () => {
    localStorage.setItem(
      'mosqueIqamah.v3',
      JSON.stringify({
        slug: 'iona',
        days: {
          '2026-10-14': {
            slug: 'iona',
            name: 'IONA Masjid',
            date: '2026-10-14',
            fajr: '06:45',
          },
        },
      })
    );
    const seen: Array<{ date?: string; fajr?: string } | null> = [];
    service.loadToday('iona', '2026-10-15').subscribe((times) => seen.push(times));
    expect(seen[0]).toEqual(jasmine.objectContaining({ date: '2026-10-14', fajr: '06:45' }));
    http.expectOne('/api/mosques/iona/times?date=2026-10-15&days=0').flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: {
        date: '2026-10-15',
        fajr: { iqamah: '06:50' },
      },
    });
    expect(seen[1]).toEqual(jasmine.objectContaining({ date: '2026-10-15', fajr: '06:50' }));
    http.expectOne('/api/mosques/iona/times?date=2026-10-16&days=0').flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: { date: '2026-10-16', fajr: { iqamah: '06:51' } },
    });
  });

  it('uses a prefetched next day as soon as the date rolls over', () => {
    localStorage.setItem(
      'mosqueIqamah.v3',
      JSON.stringify({
        slug: 'iona',
        days: {
          '2026-10-15': {
            slug: 'iona',
            name: 'IONA Masjid',
            date: '2026-10-15',
            fajr: '06:50',
          },
        },
      })
    );
    const seen: Array<{ date?: string; fajr?: string } | null> = [];
    service.loadToday('iona', '2026-10-15').subscribe((times) => seen.push(times));
    expect(seen[0]).toEqual(jasmine.objectContaining({ date: '2026-10-15', fajr: '06:50' }));
    http.expectOne('/api/mosques/iona/times?date=2026-10-15&days=0').flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: { date: '2026-10-15', fajr: { iqamah: '06:50' } },
    });
    http.expectOne('/api/mosques/iona/times?date=2026-10-16&days=0').flush({
      mosque: { slug: 'iona', name: 'IONA Masjid' },
      today: { date: '2026-10-16', fajr: { iqamah: '06:51' } },
    });
  });
});
