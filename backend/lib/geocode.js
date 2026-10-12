// Address → lat/lng via Nominatim (OpenStreetMap). Usage policy compliance:
// max 1 request/second (enforced with a global queue), identifying User-Agent,
// and results cached upstream in the al_licenses table so each address is
// geocoded at most once.
//
// Strategy: structured street queries first (with the house number, then
// without, scoped by localidade, postal code or concelho), then a postal-code
// query, then free-text locality queries (localidade before freguesia, so a
// Vilamoura flat doesn't land on the Quarteira parish centre). RNT street
// fields are hand-typed and noisy ("Rua Rua X", "X, condomínio Y, Bloco 5",
// "X- COND.Y"), so the street is cleaned first — without that almost every
// lookup fell through to the parish centre and whole portfolios stacked on a
// single map pin.
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

// Everything after the street name proper: building, block, lot, unit, floor.
const VIA_TAIL =
  /\s*(?:[,;(]|\s-\s|-\s|\b(?:n\.?\s*º|nº|lote|lt\.?|bloco|bl\.?|edf\.?|edif[ií]cio|cond\.?|condom[ií]nio|torre|moradia|vivenda|apart(?:amento)?s?|apt\.?|fra?c[çc][ãa]o|loja|r\/c|piso|andar)\b).*$/i;

// RNT tipoVia + via → the bare street name Nominatim knows, or null.
//   "Rua" + "Manuel da Fonseca, condomínio Vila Sol F5, Bloco 5" → "Rua Manuel da Fonseca"
//   "Rua" + "Rua AGOSTO AZUL- TRES CASTELOS. EDF. CLUBE" → "Rua AGOSTO AZUL"
//   "Avenida" + "Comunidades Lusíadas- COND.PARAISO"     → "Avenida Comunidades Lusíadas"
function cleanStreet(tipoVia, via) {
  let name = String(via || '').replace(VIA_TAIL, '').replace(/\s+/g, ' ').trim();
  if (!name || /\bsem nome\b/i.test(name)) return null;
  const type = String(tipoVia || '').trim();
  // The portal often repeats the type inside the name ("Rua Rua X").
  if (type && name.toLowerCase().startsWith(type.toLowerCase() + ' ')) name = name.slice(type.length + 1);
  return [type, name].filter(Boolean).join(' ');
}

// A usable house number ("78", "61A", "5 B"); building codes like "EM21" are not.
function houseNumber(porta) {
  const m = String(porta || '').trim().match(/^(\d{1,4})\s?([a-z])?$/i);
  return m ? m[1] + (m[2] || '').toUpperCase() : null;
}

// address: the parsed RNT address object (see lib/rnt.js).
// Returns { lat, lng, precision: 'street'|'postal'|'locality'|null }.
async function geocodeAddress(address, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubGeocode(address);
  if (!address) return { lat: null, lng: null, precision: null };

  const expected = expectedRegion(address);
  const attempts = buildAttempts(address);
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

// Ordered Nominatim queries for one RNT address, most precise first. The
// loop stops at the first region-valid hit, so a clean address costs one
// request and only messy ones walk down the list.
function buildAttempts(address) {
  const street = cleanStreet(address.tipoVia, address.via);
  const number = houseNumber(address.porta);
  const county = address.concelho || '';
  const town = address.localidade || '';
  const attempts = [];

  if (street) {
    if (number && town) {
      attempts.push({ params: { street: `${number} ${street}`, city: town, county }, precision: 'street' });
    }
    if (town) attempts.push({ params: { street, city: town, county }, precision: 'street' });
    if (address.postalCode) {
      attempts.push({ params: { street, postalcode: address.postalCode, county }, precision: 'street' });
    }
    // Localidade names don't always match an OSM place; the concelho alone
    // still pins the street, only less safely when a name repeats inside it.
    attempts.push({ params: { street, county }, precision: 'street' });
  }
  if (address.postalCode) {
    attempts.push({ params: { postalcode: address.postalCode, county }, precision: 'postal' });
  }
  if (town && town !== address.freguesia) {
    const q = [town, county, address.distrito].filter(Boolean).join(', ');
    attempts.push({ params: { q: `${q}, Portugal` }, precision: 'locality' });
  }
  const locality = [address.freguesia, county, address.distrito].filter(Boolean).join(', ');
  if (locality) {
    attempts.push({ params: { q: `${locality}, Portugal` }, precision: 'locality' });
  }
  // Legacy free-text fallback for addresses missing the structured parts.
  if (attempts.length === 0 && address.full) {
    attempts.push({ params: { q: `${address.full}, Portugal` }, precision: 'street' });
  }
  return attempts;
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

module.exports = {
  geocodeAddress,
  expectedRegion,
  coordsRegion,
  cleanStreet,
  houseNumber,
  buildAttempts,
};
