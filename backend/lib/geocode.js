// Address → lat/lng via Nominatim (OpenStreetMap). Usage policy compliance:
// max 1 request/second (enforced with a global queue), identifying User-Agent,
// and results cached upstream in the al_licenses table so each address is
// geocoded at most once.
//
// Strategy: structured street query first, then postal-code fallback, then a
// free-text locality query built from the RNT freguesia/concelho/distrito.
// Every hit is validated against the region implied by the RNT address
// (mainland vs Madeira vs Azores) — Portuguese street names collide across
// hundreds of parishes, and countrycodes=pt alone happily returns an island
// street for a mainland address.

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

// Region a parsed RNT address should geocode into. Postal prefix is the most
// reliable signal (9000–9499 Madeira, 9500–9999 Azores, 1000–8999 mainland);
// distrito is the fallback. Null means "no expectation — accept anything".
function expectedRegion(address) {
  if (!address) return null;
  const m = (address.postalCode || '').match(/^(\d{4})/);
  if (m) {
    const prefix = parseInt(m[1], 10);
    if (prefix >= 9000 && prefix <= 9499) return 'madeira';
    if (prefix >= 9500 && prefix <= 9999) return 'azores';
    if (prefix >= 1000 && prefix <= 8999) return 'mainland';
  }
  const distrito = address.distrito || '';
  if (/a[çc]ores/i.test(distrito)) return 'azores';
  if (/madeira/i.test(distrito)) return 'madeira';
  if (distrito) return 'mainland';
  return null;
}

function coordsRegion(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'unknown';
  if (lat >= 32.2 && lat <= 33.3 && lng >= -17.5 && lng <= -16.0) return 'madeira';
  if (lat >= 36.5 && lat <= 39.9 && lng >= -31.6 && lng <= -24.5) return 'azores';
  if (lat >= 36.8 && lat <= 42.2 && lng >= -9.6 && lng <= -6.1) return 'mainland';
  return 'unknown';
}

// params: { q } for free-text, or structured { street, postalcode, county, state }.
// Returns up to 3 candidate hits so the caller can region-filter.
async function queryNominatim(params, signal) {
  const search = new URLSearchParams({ format: 'jsonv2', limit: '3', countrycodes: 'pt' });
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const res = await fetch(`${NOMINATIM}?${search}`, {
    signal,
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-PT' },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((hit) => ({ lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }))
    .filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng));
}

// address: the parsed RNT address object (see lib/rnt.js).
// Returns { lat, lng, precision: 'street'|'postal'|'locality'|null }.
async function geocodeAddress(address, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubGeocode(address);
  if (!address) return { lat: null, lng: null, precision: null };

  const expected = expectedRegion(address);
  const street = [address.tipoVia, address.via, address.porta].filter(Boolean).join(' ').trim();

  const attempts = [];
  if (street && address.postalCode) {
    attempts.push({
      params: { street, postalcode: address.postalCode, county: address.concelho || '' },
      precision: 'street',
    });
  }
  if (address.postalCode) {
    attempts.push({
      params: { postalcode: address.postalCode, county: address.concelho || '' },
      precision: 'postal',
    });
  }
  const locality = [address.freguesia, address.concelho, address.distrito]
    .filter(Boolean)
    .join(', ');
  if (locality) {
    attempts.push({ params: { q: `${locality}, Portugal` }, precision: 'locality' });
  }
  // Legacy free-text fallback for addresses missing the structured parts.
  if (attempts.length === 0 && address.full) {
    attempts.push({ params: { q: `${address.full}, Portugal` }, precision: 'street' });
  }

  for (const attempt of attempts) {
    if (signal?.aborted) throw new Error('Aborted');
    try {
      const hits = await throttled(() => queryNominatim(attempt.params, signal));
      const match = hits.find(
        (hit) => !expected || coordsRegion(hit.lat, hit.lng) === expected
      );
      if (match) return { ...match, precision: attempt.precision };
      if (hits.length > 0) {
        logger.warn(
          `geocode rejected ${hits.length} hit(s) outside expected region "${expected}" ` +
            `(${JSON.stringify(attempt.params)})`
        );
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`geocode attempt failed (${JSON.stringify(attempt.params)}):`, err.message);
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

module.exports = { geocodeAddress, expectedRegion, coordsRegion };
