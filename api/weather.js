/**
 * Weather proxy: free Open-Meteo first; OpenWeather One Call 3.0 only
 * if Open-Meteo fails. Keeps displays working without burning paid quota.
 *
 * Env:
 *   OPENWEATHER_API_KEY   — optional fallback when Open-Meteo fails
 *   WEATHER_PROVIDER      — "openmeteo" (default) | "openweather"
 *                           "openweather" skips Open-Meteo and uses OWM only
 *   WEATHER_CACHE_SECONDS — CDN cache TTL (default 600 = 10 min)
 */
const DEFAULT_CACHE_SECONDS = 600;

function cacheSeconds() {
  const n = Number(process.env.WEATHER_CACHE_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CACHE_SECONDS;
}

function setOkCache(res) {
  const s = cacheSeconds();
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${s}, stale-while-revalidate=${Math.min(s, 600)}`
  );
}

function asTemp(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

async function fetchOpenMeteo(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    '&current=temperature_2m,apparent_temperature' +
    '&temperature_unit=fahrenheit';

  const upstream = await fetch(url);
  if (!upstream.ok) {
    const err = new Error(`Open-Meteo ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  const data = await upstream.json();
  const temp = asTemp(data?.current?.temperature_2m);
  if (temp === null) throw new Error('Open-Meteo temp missing');
  return {
    temp,
    feelsLike: asTemp(data?.current?.apparent_temperature),
    source: 'openmeteo',
  };
}

async function fetchOpenWeather(lat, lon, key) {
  const url =
    'https://api.openweathermap.org/data/3.0/onecall' +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    '&exclude=minutely,hourly,daily,alerts' +
    '&units=imperial' +
    `&appid=${encodeURIComponent(key)}`;

  const upstream = await fetch(url);
  if (!upstream.ok) {
    const err = new Error(`OWM ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  const data = await upstream.json();
  const temp = asTemp(data?.current?.temp);
  if (temp === null) throw new Error('OWM temp missing');
  return {
    temp,
    feelsLike: asTemp(data?.current?.feels_like),
    source: 'openweather',
  };
}

/** Free Open-Meteo first; paid OWM only when needed (or forced via env). */
async function resolveTemp(lat, lon) {
  const provider = (process.env.WEATHER_PROVIDER || 'openmeteo').toLowerCase();
  const key = process.env.OPENWEATHER_API_KEY?.trim();

  if (provider === 'openweather') {
    if (!key) throw new Error('OPENWEATHER_API_KEY required for openweather provider');
    return fetchOpenWeather(lat, lon, key);
  }

  try {
    return await fetchOpenMeteo(lat, lon);
  } catch {
    if (!key) throw new Error('Open-Meteo failed and no OpenWeather key configured');
    return fetchOpenWeather(lat, lon, key);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon ?? req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'lat and lon are required' }));
  }

  try {
    const { temp, feelsLike, source } = await resolveTemp(lat, lon);
    res.statusCode = 200;
    setOkCache(res);
    return res.end(JSON.stringify({ temp, feelsLike, source }));
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: 'Weather request failed' }));
  }
};
