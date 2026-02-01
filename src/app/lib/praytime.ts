// praytime.js - Prayer Times Calculator (v3.2)
// Copyright (c) 2007-2025 Hamid Zarrabi-Zadeh
// Source: https://praytimes.org
// License: MIT
//
// NOTE: This is a minimal TypeScript-friendly port for Angular usage.

export type PrayTimeMethod =
  | 'MWL'
  | 'ISNA'
  | 'Egypt'
  | 'Makkah'
  | 'Karachi'
  | 'Tehran'
  | 'Jafari'
  | 'France'
  | 'Russia'
  | 'Singapore';

export type PrayTimeTimeFormat = '24h' | '12h' | '12H' | 'x' | 'X';

export type PrayTimeFormat = PrayTimeTimeFormat | ((timestamp: number) => string);

export type PrayTimeRounding = 'nearest' | 'up' | 'down' | 'none';

export type PrayTimeAsrMethod = 'Standard' | 'Hanafi';

export type PrayTimeHighLats = 'NightMiddle' | 'OneSeventh' | 'AngleBased' | 'None';

export type PrayTimeMidnight = 'Standard' | 'Jafari';

export type PrayTimeSettings = {
  dhuhr?: string;
  asr?: PrayTimeAsrMethod | string;
  highLats?: PrayTimeHighLats;
  tune?: Record<string, number>;
  format?: PrayTimeFormat;
  rounding?: PrayTimeRounding;
  utcOffset?: 'auto' | number;
  timezone?: string;
  location?: [number, number]; // [lat, lng]
  iterations?: number;
  fajr?: number;
  isha?: number | string;
  maghrib?: number | string;
  midnight?: PrayTimeMidnight;
};

export type PrayTimeTimes<T = string> = {
  fajr: T;
  sunrise: T;
  dhuhr: T;
  asr: T;
  sunset: T;
  maghrib: T;
  isha: T;
  midnight: T;
};

export class PrayTime {
  methods: Record<string, any>;
  settings: Required<PrayTimeSettings> & Record<string, any>;
  labels: string[];

  private utcTime = 0;
  private adjusted = false;

  constructor(method?: PrayTimeMethod) {
    this.methods = {
      MWL: { fajr: 18, isha: 17 },
      ISNA: { fajr: 15, isha: 15 },
      Egypt: { fajr: 19.5, isha: 17.5 },
      Makkah: { fajr: 18.5, isha: '90 min' },
      Karachi: { fajr: 18, isha: 18 },
      Tehran: { fajr: 17.7, maghrib: 4.5, midnight: 'Jafari' },
      Jafari: { fajr: 16, maghrib: 4, midnight: 'Jafari' },
      France: { fajr: 12, isha: 12 },
      Russia: { fajr: 16, isha: 15 },
      Singapore: { fajr: 20, isha: 18 },
      defaults: { isha: 14, maghrib: '1 min', midnight: 'Standard' },
    };

    this.settings = {
      dhuhr: '0 min',
      asr: 'Standard',
      highLats: 'NightMiddle',
      tune: {},
      format: '24h',
      rounding: 'nearest',
      utcOffset: 'auto',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: [0, -(new Date()).getTimezoneOffset() / 4],
      iterations: 1,
    } as any;

    this.labels = [
      'Fajr',
      'Sunrise',
      'Dhuhr',
      'Asr',
      'Sunset',
      'Maghrib',
      'Isha',
      'Midnight',
    ];

    this.method(method || 'MWL');
  }

  // ---------------------- Setters ------------------------

  method(method: PrayTimeMethod) {
    return this.set(this.methods['defaults']).set(this.methods[method]);
  }

  adjust(params: PrayTimeSettings) {
    return this.set(params);
  }

  location(location: [number, number]) {
    return this.set({ location });
  }

  timezone(timezone: string) {
    return this.set({ timezone });
  }

  tune(tune: Record<string, number>) {
    return this.set({ tune });
  }

  round(rounding: PrayTimeRounding = 'nearest') {
    return this.set({ rounding });
  }

  format(format: PrayTimeTimeFormat) {
    return this.set({ format });
  }

  set(settings: PrayTimeSettings) {
    Object.assign(this.settings, settings);
    return this;
  }

  utcOffset(utcOffset: 'auto' | number = 'auto') {
    if (typeof utcOffset === 'number' && Math.abs(utcOffset) < 16) utcOffset *= 60;
    this.set({ timezone: 'UTC' });
    return this.set({ utcOffset });
  }

  // ---------------------- Getters ------------------------

  times(date: number | Date | [number, number, number] = 0): PrayTimeTimes<string> {
    if (typeof date === 'number') {
      date = new Date(date < 1000 ? Date.now() + date * 864e5 : date);
    }
    if (date instanceof Date) {
      date = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    }
    this.utcTime = Date.UTC(date[0], date[1] - 1, date[2]);

    const numericTimes = this.computeTimes();
    return this.formatTimes(numericTimes);
  }

  // backward compatible signature
  getTimes(
    date?: any,
    location?: [number, number],
    timezone: 'auto' | number = 'auto',
    dst = 0,
    format: PrayTimeTimeFormat = '24h',
  ) {
    if (!location) return this.times(date);
    const utcOffset = timezone === 'auto' ? timezone : timezone + dst;
    this.location(location).utcOffset(utcOffset).format(format);
    return this.times(date);
  }

  // ---------------------- Deprecated -------------------------

  setMethod(method: PrayTimeMethod) {
    this.method(method);
  }

  // ---------------------- Compute Times -----------------------

  computeTimes() {
    let times: PrayTimeTimes<number> = {
      fajr: 5,
      sunrise: 6,
      dhuhr: 12,
      asr: 13,
      sunset: 18,
      maghrib: 18,
      isha: 18,
      midnight: 24,
    };

    for (let i = 0; i < this.settings.iterations; i++) times = this.processTimes(times);

    this.adjustHighLats(times);
    this.updateTimes(times);
    this.tuneTimes(times);
    this.convertTimes(times);
    return times;
  }

  processTimes(times: PrayTimeTimes<number>) {
    const params = this.settings;
    const horizon = 0.833;

    return {
      fajr: this.angleTime(params.fajr, times.fajr, -1),
      sunrise: this.angleTime(horizon, times.sunrise, -1),
      dhuhr: this.midDay(times.dhuhr),
      asr: this.angleTime(this.asrAngle(params.asr, times.asr), times.asr),
      sunset: this.angleTime(horizon, times.sunset),
      maghrib: this.angleTime(params.maghrib, times.maghrib),
      isha: this.angleTime(params.isha, times.isha),
      midnight: this.midDay(times.midnight) + 12,
    } as PrayTimeTimes<number>;
  }

  updateTimes(times: PrayTimeTimes<number>) {
    const params = this.settings;

    if (this.isMin(params.maghrib)) times.maghrib = times.sunset + this.value(params.maghrib) / 60;
    if (this.isMin(params.isha)) times.isha = times.maghrib + this.value(params.isha) / 60;
    if (params.midnight === 'Jafari') {
      const nextFajr = this.angleTime(params.fajr, 29, -1) + 24;
      times.midnight = (times.sunset + (this.adjusted ? times.fajr + 24 : nextFajr)) / 2;
    }
    times.dhuhr += this.value(params.dhuhr) / 60;
  }

  tuneTimes(times: PrayTimeTimes<number>) {
    const mins = this.settings.tune;
    for (const i in times) if (i in mins) (times as any)[i] += (mins as any)[i] / 60;
  }

  convertTimes(times: PrayTimeTimes<number>) {
    const lng = this.settings.location[1];
    for (const i in times) {
      const time = (times as any)[i] - lng / 15;
      const timestamp = this.utcTime + Math.floor(time * 36e5);
      (times as any)[i] = this.roundTime(timestamp);
    }
  }

  roundTime(timestamp: number) {
    const rounding = ({ up: 'ceil', down: 'floor', nearest: 'round' } as any)[this.settings.rounding];
    if (!rounding) return timestamp;
    const OneMinute = 6e4;
    return (Math as any)[rounding](timestamp / OneMinute) * OneMinute;
  }

  // ---------------------- Calculation Functions -----------------------

  sunPosition(time: any) {
    const lng = this.settings.location[1];
    const D = this.utcTime / 864e5 - 10957.5 + this.value(time) / 24 - lng / 360;

    const g = this.mod(357.529 + 0.98560028 * D, 360);
    const q = this.mod(280.459 + 0.98564736 * D, 360);
    const L = this.mod(q + 1.915 * this.sin(g) + 0.02 * this.sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const RA = this.mod(this.arctan2(this.cos(e) * this.sin(L), this.cos(L)) / 15, 24);

    return {
      declination: this.arcsin(this.sin(e) * this.sin(L)),
      equation: q / 15 - RA,
    };
  }

  midDay(time: any) {
    const eqt = this.sunPosition(time).equation;
    const noon = this.mod(12 - eqt, 24);
    return noon;
  }

  angleTime(angle: any, time: any, direction = 1) {
    const lat = this.settings.location[0];
    const decl = this.sunPosition(time).declination;
    const numerator = -this.sin(angle) - this.sin(lat) * this.sin(decl);
    const diff = this.arccos(numerator / (this.cos(lat) * this.cos(decl))) / 15;
    return this.midDay(time) + diff * direction;
  }

  asrAngle(asrParam: any, time: any) {
    const shadowFactor = ({ Standard: 1, Hanafi: 2 } as any)[asrParam] || this.value(asrParam);
    const lat = this.settings.location[0];
    const decl = this.sunPosition(time).declination;
    return -this.arccot(shadowFactor + this.tan(Math.abs(lat - decl)));
  }

  // ---------------------- Higher Latitudes -----------------------

  adjustHighLats(times: PrayTimeTimes<number>) {
    const params = this.settings;
    if (params.highLats === 'None') return;

    this.adjusted = false;
    const night = 24 + times.sunrise - times.sunset;

    Object.assign(times, {
      fajr: this.adjustTime(times.fajr, times.sunrise, params.fajr, night, -1),
      isha: this.adjustTime(times.isha, times.sunset, params.isha, night),
      maghrib: this.adjustTime(times.maghrib, times.sunset, params.maghrib, night),
    });
  }

  adjustTime(time: any, base: any, angle: any, night: any, direction = 1) {
    const factors: Record<string, number> = {
      NightMiddle: 1 / 2,
      OneSeventh: 1 / 7,
      AngleBased: (1 / 60) * this.value(angle),
    };
    const portion = factors[this.settings.highLats] * night;
    const timeDiff = (time - base) * direction;
    if (isNaN(time) || timeDiff > portion) {
      time = base + portion * direction;
      this.adjusted = true;
    }
    return time;
  }

  // ---------------------- Formatting Functions ---------------------

  formatTimes(times: PrayTimeTimes<number>): PrayTimeTimes<string> {
    return {
      fajr: this.formatTime(times.fajr),
      sunrise: this.formatTime(times.sunrise),
      dhuhr: this.formatTime(times.dhuhr),
      asr: this.formatTime(times.asr),
      sunset: this.formatTime(times.sunset),
      maghrib: this.formatTime(times.maghrib),
      isha: this.formatTime(times.isha),
      midnight: this.formatTime(times.midnight),
    };
  }

  formatTime(timestamp: any): string {
    const format = this.settings.format;
    const InvalidTime = '-----';
    if (isNaN(timestamp)) return InvalidTime;
    if (typeof format === 'function') return format(timestamp);
    if (String(format).toLowerCase() === 'x')
      return String(Math.floor(timestamp / (format === 'X' ? 1000 : 1)));
    return this.timeToString(timestamp, format as PrayTimeTimeFormat);
  }

  timeToString(timestamp: number, format: PrayTimeTimeFormat) {
    const utcOffset = this.settings.utcOffset;
    const date = new Date(timestamp + (utcOffset === 'auto' ? 0 : (utcOffset as number) * 6e4));
    const str = date.toLocaleTimeString('en-US', {
      timeZone: this.settings.timezone,
      hour12: format === '24h' ? false : true,
      hour: format === '24h' ? '2-digit' : 'numeric',
      minute: '2-digit',
    });
    return format === '12H' ? str.replace(/ ?[AP]M/, '') : str;
  }

  // ---------------------- Misc Functions -----------------------

  value(str: any) {
    return +String(str).split(/[^0-9.+-]/)[0];
  }

  isMin(str: any) {
    return String(str).indexOf('min') !== -1;
  }

  mod(a: number, b: number) {
    return ((a % b) + b) % b;
  }

  // --------------------- Degree-Based Trigonometry -----------------

  dtr = (d: number) => (d * Math.PI) / 180;
  rtd = (r: number) => (r * 180) / Math.PI;

  sin = (d: number) => Math.sin(this.dtr(d));
  cos = (d: number) => Math.cos(this.dtr(d));
  tan = (d: number) => Math.tan(this.dtr(d));

  arcsin = (d: number) => this.rtd(Math.asin(d));
  arccos = (d: number) => this.rtd(Math.acos(d));
  arctan = (d: number) => this.rtd(Math.atan(d));

  arccot = (x: number) => this.rtd(Math.atan(1 / x));
  arctan2 = (y: number, x: number) => this.rtd(Math.atan2(y, x));
}

