// Address → lat/lng via Nominatim (OpenStreetMap). Usage policy compliance:
// max 1 request/second (enforced with a global queue), identifying User-Agent,
// and results cached upstream in the al_licenses table so each address is
// geocoded at most once.
//
// Strategy: try the full street address first; if Nominatim misses, fall back
// to postal code + concelho (Portuguese postal codes are specific enough for
// the operating-radius map).

const logger = require('./logger');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'playground-host-analyzer/1.0 (contact: brunoestreiaa7@gmail.com)';
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let chain = Promise.resolve();

function throttled(fn) {
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep the chain alive even when a lookup fails.
  chain = run.catch(() => {});
  return run;
}

async function queryNominatim(q, signal) {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=pt&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-PT' },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// address: the parsed RNT address object (see lib/rnt.js).
// Returns { lat, lng, precision: 'street'|'postal'|null }.
async function geocodeAddress(address, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubGeocode(address);
  if (!address) return { lat: null, lng: null, precision: null };

  const attempts = [];
  if (address.full) attempts.push({ q: `${address.full}, Portugal`, precision: 'street' });
  if (address.postalCode) {
    const locality = address.concelho || address.localidade || '';
    attempts.push({ q: `${address.postalCode} ${locality}, Portugal`.trim(), precision: 'postal' });
  }

  for (const attempt of attempts) {
    if (signal?.aborted) throw new Error('Aborted');
    try {
      const hit = await throttled(() => queryNominatim(attempt.q, signal));
      if (hit) return { ...hit, precision: attempt.precision };
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`geocode attempt failed (${attempt.q}):`, err.message);
    }
  }
  return { lat: null, lng: null, precision: null };
}

function stubGeocode(address) {
  // Deterministic scatter around the Algarve so the stub map looks plausible.
  const seed = (address?.postalCode || '8200').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    lat: 37.08 + ((seed % 40) - 20) * 0.004,
    lng: -8.25 + ((seed % 60) - 30) * 0.006,
    precision: 'street',
  };
}

module.exports = { geocodeAddress };
