/** Board UI language. Numerals stay Western Arabic (0–9) in every language. */
export type DisplayLanguage = 'en' | 'bn';

export function isDisplayLanguage(value: unknown): value is DisplayLanguage {
  return value === 'en' || value === 'bn';
}

export type PrayerNameKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type SunNameKey = 'sunrise' | 'sunset';
export type EventLabelKey = PrayerNameKey | SunNameKey;

type BoardCopy = {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  sunrise: string;
  sunset: string;
  starts: string;
  next: string;
  in: string;
  now: string;
  then: string;
  jumuah: string;
  doNotPray: string;
  itsTimeFor: string;
  until: string;
  fajrStarts: string;
  untilSunrise: string;
  current: string;
  feelsLike: string;
  weekdays: readonly string[];
  gregMonths: readonly string[];
  hijriMonths: readonly string[];
};

const EN: BoardCopy = {
  fajr: 'FAJR',
  dhuhr: 'DHUHR',
  asr: 'ASR',
  maghrib: 'MAGHRIB',
  isha: 'ISHA',
  sunrise: 'SUNRISE',
  sunset: 'SUNSET',
  starts: 'STARTS',
  next: 'NEXT',
  in: 'IN',
  now: 'NOW',
  then: 'THEN',
  jumuah: "JUMU'AH",
  doNotPray: 'DO NOT PRAY NOW',
  itsTimeFor: "IT'S TIME FOR",
  until: 'UNTIL',
  fajrStarts: 'FAJR STARTS',
  untilSunrise: 'UNTIL SUNRISE',
  current: 'Current:',
  feelsLike: 'Feels like:',
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  gregMonths: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  hijriMonths: [
    'Muharram',
    'Safar',
    'Rabi al-Awwal',
    'Rabi al-Thani',
    'Jumada al-Ula',
    'Jumada al-Akhirah',
    'Rajab',
    "Sha'ban",
    'Ramadan',
    'Shawwal',
    "Dhul Qi'dah",
    'Dhul Hijjah',
  ],
};

/** Common Bangladesh prayer-app spellings; digits stay Latin. */
const BN: BoardCopy = {
  fajr: 'ফজর',
  dhuhr: 'যোহর',
  asr: 'আসর',
  maghrib: 'মাগরিব',
  isha: 'এশা',
  sunrise: 'সূর্যোদয়',
  sunset: 'সূর্যাস্ত',
  starts: 'শুরু',
  next: 'পরবর্তী',
  in: 'বাকি',
  now: 'এখন',
  then: 'এরপর',
  jumuah: 'জুমআ',
  doNotPray: 'এখন নামাজ পড়বেন না',
  itsTimeFor: 'সময় হয়েছে',
  until: 'পর্যন্ত',
  fajrStarts: 'ফজর শুরু',
  untilSunrise: 'সূর্যোদয় পর্যন্ত',
  current: 'এখন:',
  feelsLike: 'অনুভূত:',
  weekdays: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
  gregMonths: [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ],
  hijriMonths: [
    'মুহাররম',
    'সফর',
    'রবিউল আউয়াল',
    'রবিউস সানি',
    'জুমাদাল উলা',
    'জুমাদাল আখিরাহ',
    'রজব',
    'শাবান',
    'রমজান',
    'শাওয়াল',
    'জিলকদ',
    'জিলহজ',
  ],
};

const BY_LANG: Record<DisplayLanguage, BoardCopy> = { en: EN, bn: BN };

export function boardCopy(lang: DisplayLanguage): BoardCopy {
  return BY_LANG[isDisplayLanguage(lang) ? lang : 'en'];
}

export function prayerLabel(lang: DisplayLanguage, key: PrayerNameKey): string {
  return boardCopy(lang)[key];
}

export function sunLabel(lang: DisplayLanguage, key: SunNameKey): string {
  return boardCopy(lang)[key];
}

export function eventLabel(lang: DisplayLanguage, key: EventLabelKey): string {
  return boardCopy(lang)[key];
}

/** English wall style for EN; Bangla keeps natural case. */
export function displayCase(lang: DisplayLanguage, text: string): string {
  return lang === 'en' ? text.toUpperCase() : text;
}

/** Gregorian: "SUNDAY, DEC 8 2026" / Bangla weekday + month + Latin day/year. */
export function formatGregorianLabel(lang: DisplayLanguage, date: Date): string {
  const copy = boardCopy(lang);
  const weekday = copy.weekdays[date.getDay()] ?? '';
  const month = copy.gregMonths[date.getMonth()] ?? '';
  const day = date.getDate();
  const year = date.getFullYear();
  if (lang === 'bn') {
    return `${weekday}, ${month} ${day} ${year}`;
  }
  return `${weekday.toUpperCase()}, ${month.toUpperCase()} ${day} ${year}`;
}

/** Hijri: "RAMADAN 15 1447" / Bangla month + Latin day/year. monthIndex is 1–12. */
export function formatHijriLabel(
  lang: DisplayLanguage,
  day: number,
  monthIndex: number,
  year: number,
  fallbackMonthName?: string
): string {
  const copy = boardCopy(lang);
  const month =
    copy.hijriMonths[monthIndex - 1] ??
    fallbackMonthName ??
    copy.hijriMonths[0];
  if (lang === 'bn') {
    return `${month} ${day} ${year}`;
  }
  return `${month.toUpperCase()} ${day} ${year}`;
}

export function untilPrayerLabel(lang: DisplayLanguage, key: PrayerNameKey): string {
  const copy = boardCopy(lang);
  const name = copy[key];
  if (lang === 'bn') return `${name} ${copy.until}`;
  return `${copy.until} ${name}`;
}

export function untilClockLabel(lang: DisplayLanguage, clock: string): string {
  const copy = boardCopy(lang);
  if (lang === 'bn') return `${clock} ${copy.until}`;
  return `${copy.until} ${clock}`;
}
