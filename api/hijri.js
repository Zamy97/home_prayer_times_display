/**
 * Proxy for Central Hilal Committee Hijri calendar data.
 * Source: https://hilalcommittee.org/api/HijriDates
 *
 * Returns month lengths for the current CHC Hijri year plus today's computed date.
 * Falls back to parsing the CHC homepage "IDate" label when needed.
 *
 * Env:
 *   HIJRI_CACHE_SECONDS — CDN cache TTL (default 21600 = 6 hours)
 */
const CHC_API = 'https://hilalcommittee.org/api/HijriDates';
const CHC_HOME = 'https://hilalcommittee.org/';
const DEFAULT_CACHE_SECONDS = 21600;

const MONTH_NAMES = [
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
];

function cacheSeconds() {
  const n = Number(process.env.HIJRI_CACHE_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CACHE_SECONDS;
}

function setOkCache(res) {
  const s = cacheSeconds();
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${s}, stale-while-revalidate=${Math.min(s, 3600)}`
  );
}

function parseFirstDay(raw) {
  const m = String(raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonthsFrom(numOfDays) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    const n = Number(numOfDays?.[`NumDaysMonth${i}`]);
    out.push(Number.isFinite(n) && n >= 29 && n <= 30 ? n : 30);
  }
  return out;
}

function civilTodayParts() {
  const now = new Date();
  return {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  };
}

function toOrdinal(parts) {
  return Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000;
}

function computeHijri(calendar, today) {
  const first = parseFirstDay(calendar.FirstDay);
  if (!first) return null;
  const days = daysInMonthsFrom(calendar.NumOfDays);
  let cursor = toOrdinal(first);
  const target = toOrdinal(today);

  for (let i = 0; i < 12; i++) {
    const end = cursor + days[i] - 1;
    if (target >= cursor && target <= end) {
      const day = target - cursor + 1;
      const monthName = MONTH_NAMES[i];
      return {
        day,
        monthIndex: i + 1,
        monthName,
        year: calendar.HijriYear,
        label: `${monthName.toUpperCase()} ${day}`,
      };
    }
    cursor = end + 1;
  }
  return null;
}

async function fetchChcCalendar() {
  const upstream = await fetch(CHC_API, {
    headers: { Accept: 'application/json' },
  });
  if (!upstream.ok) throw new Error(`CHC HijriDates ${upstream.status}`);
  return upstream.json();
}

async function fetchHomepageIDate() {
  const upstream = await fetch(CHC_HOME, {
    headers: { Accept: 'text/html', 'User-Agent': 'HomePrayerTimesDisplay/1.0' },
  });
  if (!upstream.ok) throw new Error(`CHC home ${upstream.status}`);
  const html = await upstream.text();
  const match = html.match(/class="IDate">\s*([^<]+?)\s*</i);
  if (!match) return null;
  const raw = match[1].replace(/\s+/g, ' ').trim();
  // e.g. "21 Rabi al-Awwal 1448"
  const parts = raw.match(/^(\d{1,2})\s+(.+?)\s+(\d{4})$/);
  if (!parts) {
    return { label: raw.toUpperCase(), source: 'chc-home' };
  }
  return {
    day: Number(parts[1]),
    monthName: parts[2],
    year: Number(parts[3]),
    label: `${parts[2].toUpperCase()} ${parts[1]}`,
    source: 'chc-home',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const calendar = await fetchChcCalendar();
    const today = civilTodayParts();
    let hijri = computeHijri(calendar, today);
    let source = 'chc-api';

    if (!hijri) {
      const fromHome = await fetchHomepageIDate().catch(() => null);
      if (fromHome) {
        hijri = fromHome;
        source = 'chc-home';
      }
    }

    if (!hijri) throw new Error('Could not resolve Hijri date');

    const payload = {
      source,
      today: hijri,
      calendar: {
        hijriYear: calendar.HijriYear,
        firstDay: String(calendar.FirstDay ?? '').slice(0, 10),
        daysInMonths: daysInMonthsFrom(calendar.NumOfDays),
      },
    };

    res.statusCode = 200;
    setOkCache(res);
    return res.end(JSON.stringify(payload));
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: 'Hijri date request failed' }));
  }
};
