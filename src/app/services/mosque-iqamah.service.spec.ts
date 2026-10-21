import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MosqueIqamahService } from './mosque-iqamah.service';

describe('MosqueIqamahService', () => {
  let service: MosqueIqamahService;
  let http: HttpTestingController;

  function failTimes(slug: string, date: string): void {
    const url = `/api/mosques/${slug}/times?date=${date}&days=0`;
    for (let attempt = 0; attempt < 5; attempt++) {
      http.expectOne(url).flush('no', { status: 502, statusText: 'Bad Gateway' });
      if (attempt < 4) tick(Math.min(4000 * 2 ** attempt, 40000));
    }
  }

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
    expect(service.columnLabel('MCM Masjid', 'mcm')).toBe('MCM');
    expect(service.columnLabel('AMDA', 'amda')).toBe('AMDA');
    expect(service.columnLabel('Darul Uloom Michigan', 'darul-uloom')).toBe('DARUL ULOOM MI');
    expect(service.columnLabel('Masjid Al-Taqwa', 'taqwa')).toBe('AL TAQWA');
    expect(service.columnLabel('Masjid Al-Furqaan', 'furqaan')).toBe('AL FURQAAN');
    expect(service.columnLabel('Islamic Association of Greater Detroit', 'iagd')).toBe('IAGD');
    expect(service.columnLabel('Masjid Uthman Bin Affan', 'uthman')).toBe('UTHMAN');
    expect(service.columnLabel('Muslim Community Association of Ann Arbor', 'mca')).toBe('MCA');
    expect(service.columnLabel('Tawheed Center', 'tawheed')).toBe('TAWHEED');
    expect(service.columnLabel('Tawheed Center of Novi', 'tawheed-novi')).toBe('TAWHEED NOVI');
    expect(service.columnLabel('Tawheed Center of Southfield', 'tawheed-southfield')).toBe('TAWHEED SF');
    expect(service.columnLabel('MCWS', 'mcws')).toBe('MCWS');
    expect(service.columnLabel('Muslim Unity Center', 'unity')).toBe('UNITY');
    expect(service.columnLabel('American Moslem Society', 'ams')).toBe('AMS');
    expect(service.columnLabel('Masjid Al-Salaam', 'al-salaam')).toBe('AL SALAAM');
    expect(service.columnLabel('Islamic Center of Detroit', 'icd')).toBe('ICD');
    expect(service.columnLabel('UMMA', 'umma')).toBe('UMMA');
    expect(service.columnLabel('Rayyan Center', 'rayyan')).toBe('RAYYAN');
    expect(service.columnLabel('Jamiah Masjid of Troy', 'jamiah-troy')).toBe('JAMIAH TROY');
    expect(service.columnLabel('Masjid Bilal Canton', 'bilal-canton')).toBe('BILAL CANTON');
    expect(service.columnLabel('Masjid Bilal Ypsilanti', 'bilal-ypsi')).toBe('BILAL YPSI');
    expect(service.columnLabel('Masjid Madinatul Ilm', 'mmi')).toBe('MMI');
    expect(service.columnLabel('Dar Al Salam Islamic Center', 'dar-al-salam')).toBe('DAR AL SALAM');
    expect(service.columnLabel('Sterling Heights Islamic Center', 'sic')).toBe('SIC');
    expect(service.columnLabel('Al Falah Institute', 'al-falah')).toBe('AL FALAH');
    expect(service.columnLabel('Islamic House of Wisdom', 'ihw')).toBe('IHW');
    expect(service.columnLabel('Islamic Center of Saginaw', 'saginaw')).toBe('SAGINAW');
    expect(service.columnLabel('AL-Tawheed Islamic Center', 'gr-masjid')).toBe('GR MASJID');
    expect(service.columnLabel('Islamic Center of Shelby', 'shelby')).toBe('SHELBY');
    expect(service.columnLabel('AMS Coldwater Masjid', 'coldwater')).toBe('COLDWATER');
    expect(service.columnLabel('United Community Center / Great Mosque', 'ucc')).toBe('UCC');
    expect(service.columnLabel('BAIC Detroit', 'baic')).toBe('BAIC');
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
      'mcm',
      'amda',
      'madania',
    ]);
    expect(listed[0].address).toBe('28630 Ryan Rd');
    expect(listed[8]).toEqual({ slug: 'madania', name: 'Madania Masjid', city: 'Warren', state: 'MI' });
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
      'mcm',
      'amda',
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

  it('does not show yesterday as today while waiting for the API', () => {
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
    expect(seen[0]).toBeNull();
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

  it('keeps today’s cached iqamah if the API fails', fakeAsync(() => {
    localStorage.setItem(
      'mosqueIqamah.v3',
      JSON.stringify({
        slug: 'iona',
        days: {
          '2026-10-19': {
            slug: 'iona',
            name: 'IONA Masjid',
            date: '2026-10-19',
            fajr: '06:50',
          },
        },
      })
    );
    const seen: Array<{ date?: string; fajr?: string } | null> = [];
    service.loadToday('iona', '2026-10-19').subscribe((times) => seen.push(times));
    expect(seen[0]).toEqual(jasmine.objectContaining({ date: '2026-10-19', fajr: '06:50' }));
    failTimes('iona', '2026-10-19');
    expect(seen[seen.length - 1]).toEqual(
      jasmine.objectContaining({ date: '2026-10-19', fajr: '06:50' })
    );
  }));

  it('emits null when the API fails and there is no today cache', fakeAsync(() => {
    const seen: Array<{ date?: string } | null> = [];
    service.loadToday('amda', '2026-10-19').subscribe((times) => seen.push(times));
    expect(seen[0]).toBeNull();
    failTimes('amda', '2026-10-19');
    expect(seen[seen.length - 1]).toBeNull();
  }));

  it('keeps today’s cache when the API returns an empty day', () => {
    localStorage.setItem(
      'mosqueIqamah.v3',
      JSON.stringify({
        slug: 'amda',
        days: {
          '2026-10-19': {
            slug: 'amda',
            name: 'AMDA',
            date: '2026-10-19',
            fajr: '07:00',
          },
        },
      })
    );
    const seen: Array<{ fajr?: string } | null> = [];
    service.loadToday('amda', '2026-10-19').subscribe((times) => seen.push(times));
    expect(seen[0]).toEqual(jasmine.objectContaining({ fajr: '07:00' }));
    http.expectOne('/api/mosques/amda/times?date=2026-10-19&days=0').flush({
      mosque: { slug: 'amda', name: 'AMDA' },
      today: { date: '2026-10-19' },
    });
    expect(seen[seen.length - 1]).toEqual(jasmine.objectContaining({ fajr: '07:00' }));
  });

  it('ignores a payload for a different masjid or date', () => {
    let result: unknown = 'unset';
    service.loadToday('amda', '2026-10-19').subscribe((times) => (result = times));
    expect(result).toBeNull();
    http.expectOne('/api/mosques/amda/times?date=2026-10-19&days=0').flush({
      mosque: { slug: 'mcm', name: 'MCM Masjid' },
      today: { date: '2026-10-19', fajr: { iqamah: '07:00' } },
    });
    expect(result).toBeNull();

    service.loadToday('amda', '2026-10-19').subscribe((times) => (result = times));
    http.expectOne('/api/mosques/amda/times?date=2026-10-19&days=0').flush({
      mosque: { slug: 'amda', name: 'AMDA' },
      today: { date: '2026-10-18', fajr: { iqamah: '07:00' } },
    });
    expect(result).toBeNull();
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
