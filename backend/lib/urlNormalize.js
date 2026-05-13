const KEEP_PARAMS = new Set(['adults', 'children', 'infants', 'pets']);

function normalizeAirbnbUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('Empty URL');

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }

  if (!/^(www\.)?airbnb\.[a-z.]+$/i.test(u.host)) {
    throw new Error(`Not an Airbnb host: ${u.host}`);
  }

  const m = u.pathname.match(/^\/rooms\/(?:plus\/)?(\d+)/i);
  if (!m) throw new Error(`Not an Airbnb listing URL: ${trimmed}`);
  const roomId = m[1];

  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (KEEP_PARAMS.has(k)) params.set(k, v);
  }

  const host = u.host.toLowerCase().replace(/^www\./, '');
  const qs = params.toString();
  return `https://${host}/rooms/${roomId}${qs ? `?${qs}` : ''}`;
}

function isAirbnbListingUrl(raw) {
  try {
    normalizeAirbnbUrl(raw);
    return true;
  } catch {
    return false;
  }
}

module.exports = { normalizeAirbnbUrl, isAirbnbListingUrl };
