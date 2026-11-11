import {
  boardCopy,
  formatGregorianLabel,
  formatHijriLabel,
  prayerLabel,
  sunLabel,
  untilPrayerLabel,
} from './display-labels';

describe('display-labels', () => {
  it('keeps English prayer names uppercase-style', () => {
    expect(prayerLabel('en', 'fajr')).toBe('FAJR');
    expect(prayerLabel('en', 'dhuhr')).toBe('DHUHR');
    expect(sunLabel('en', 'sunrise')).toBe('SUNRISE');
  });

  it('uses Bangla prayer and sun names with Latin digits elsewhere', () => {
    expect(prayerLabel('bn', 'fajr')).toBe('ফজর');
    expect(prayerLabel('bn', 'asr')).toBe('আসর');
    expect(sunLabel('bn', 'sunset')).toBe('সূর্যাস্ত');
  });

  it('formats Gregorian with weekday, month, day, and year', () => {
    const date = new Date(2026, 9, 18); // Oct 18, 2026 = Sunday
    expect(formatGregorianLabel('en', date)).toBe('SUNDAY, OCT 18 2026');
    expect(formatGregorianLabel('bn', date)).toContain('রবিবার');
    expect(formatGregorianLabel('bn', date)).toContain('18');
    expect(formatGregorianLabel('bn', date)).toContain('2026');
  });

  it('formats Hijri with month, day, and year', () => {
    expect(formatHijriLabel('en', 7, 5, 1447)).toBe('JUMADA AL-ULA 7 1447');
    expect(formatHijriLabel('bn', 7, 5, 1447)).toBe('জুমাদাল উলা 7 1447');
  });

  it('orders until-prayer phrases for each language', () => {
    expect(untilPrayerLabel('en', 'dhuhr')).toBe('UNTIL DHUHR');
    expect(untilPrayerLabel('bn', 'dhuhr')).toBe('UNTIL যোহর');
  });

  it('keeps countdown and weather chrome English in Bangla mode', () => {
    const bn = boardCopy('bn');
    expect(bn.next).toBe('NEXT');
    expect(bn.in).toBe('IN');
    expect(bn.starts).toBe('STARTS');
    expect(bn.current).toBe('Current:');
    expect(bn.feelsLike).toBe('Feels like:');
  });
});
