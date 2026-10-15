/**
 * Same-origin proxy for mosque list + iqamah times.
 * Upstream: https://mosque-iqamah-api.onrender.com (no CORS for browsers).
 *
 * Env:
 *   MOSQUE_IQAMAH_API_BASE — optional override of the Render origin
 *   MOSQUE_IQAMAH_CACHE_SECONDS — CDN cache TTL (default 3600)
 */
const DEFAULT_API_BASE = 'https://mosque-iqamah-api.onrender.com';
const DEFAULT_CACHE_SECONDS = 3600;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;

function cacheSeconds() {
  const n = Number(process.env.MOSQUE_IQAMAH_CACHE_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CACHE_SECONDS;
}

function apiBase() {
  return (process.env.MOSQUE_IQAMAH_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function setOkCache(res) {
  const s = cacheSeconds();
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${s}, stale-while-revalidate=${Math.min(s, 600)}`
  );
}

async function proxyJson(res, url) {
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = upstream.status === 404 ? 404 : 502;
      return res.end(JSON.stringify({ error: 'Mosque times unavailable' }));
    }
    setOkCache(res);
    res.statusCode = 200;
    return res.end(body);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: 'Mosque times request failed' }));
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const slug = String(req.query.slug || '').trim().toLowerCase();
  const date = String(req.query.date || '').trim();

  if (!slug) {
    return proxyJson(res, `${apiBase()}/api/mosques`);
  }
  if (!SLUG_RE.test(slug)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Unknown mosque slug' }));
  }
  if (date && !isYmd(date)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'date must be YYYY-MM-DD' }));
  }

  const params = new URLSearchParams({ days: '0' });
  if (date) params.set('date', date);
  return proxyJson(res, `${apiBase()}/api/mosques/${encodeURIComponent(slug)}/times?${params}`);
};
