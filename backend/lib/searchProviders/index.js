// Paid Google-search provider chain for AL lookups.
//
//   searchAl(al) → { provider, results, cached } | { exhausted: true }
//
// Rules (see the AL Registry plan):
//   - Cache first: an AL already answered by a provider is never re-bought.
//   - Order from SEARCH_PROVIDER_ORDER; only providers with a key are used.
//   - A provider is used only after it passes the canary (a known AL must come
//     back as its known room). Junk providers are skipped, never trusted to
//     declare "not found".
//   - Quota/auth errors mark the provider exhausted and the SAME AL moves on to
//     the next provider — a batch never breaks because one account ran dry.
//   - Changing a key (fingerprint) clears exhaustion + validation for it.

const crypto = require('crypto');
const reg = require('../../jobs/alRegistryStore');
const logger = require('../logger');

const PROVIDERS = {
  serper: require('./serper'),
  serpapi: require('./serpapi'),
  scraperapi: require('./scraperapi'),
  scrapedo: require('./scrapedo'),
};

const CANARY = { al: '178074', roomId: '1681250956240216550' };
const VALIDATION_TTL_S = 30 * 86400;
const FOREVER = 4102444800; // 2100-01-01 — until the key changes

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function startOfNextMonth() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);
}

function ordered() {
  const names = (process.env.SEARCH_PROVIDER_ORDER || 'serper,serpapi,scraperapi,scrapedo')
    .split(',')
    .map((s) => s.trim())
    .filter((n) => PROVIDERS[n]);
  return names.map((n) => PROVIDERS[n]);
}

function fingerprint(p) {
  return crypto.createHash('sha256').update(p.key()).digest('hex').slice(0, 12);
}

// Current state for a configured provider; resets it when the key changed.
function stateFor(p) {
  const fp = fingerprint(p);
  let s = reg.getProviderState(p.name);
  if (!s || s.key_fingerprint !== fp) {
    reg.setProviderState(p.name, {
      key_fingerprint: fp,
      exhausted_until: null,
      last_error: null,
      validated_at: null,
      validation_error: null,
      last_remaining: null,
    });
    s = reg.getProviderState(p.name);
  }
  return s;
}

function isExhausted(s) {
  return !!(s.exhausted_until && s.exhausted_until > nowSec());
}

function validationFresh(s) {
  const t = s.validated_at;
  return !!(t && nowSec() - t < VALIDATION_TTL_S);
}

function markFailure(p, err, al) {
  const kind = err.kind || 'transient';
  reg.logUsage({ provider: p.name, al, cost: 0, status: kind === 'transient' ? 'error' : kind });
  if (kind === 'quota' || kind === 'auth') {
    reg.setProviderState(p.name, {
      exhausted_until: kind === 'quota' && p.monthlyReset ? startOfNextMonth() : FOREVER,
      last_error: err.message,
    });
    logger.warn(`search provider ${p.name} exhausted (${kind}): ${err.message}`);
  } else {
    reg.setProviderState(p.name, { last_error: err.message });
  }
}

function linksRoom(results, roomId) {
  return results.some((r) => new RegExp(`airbnb\\.[a-z.]+/rooms/${roomId}\\b`).test(r.link));
}

// Canary check. Costs one query; runs once per key per 30 days. A failed
// validation is remembered too, so a junk provider isn't re-billed per AL.
async function ensureValidated(p, signal) {
  const s = stateFor(p);
  if (validationFresh(s)) return !s.validation_error;
  try {
    const out = await p.search(`"${CANARY.al}/AL"`, signal);
    const ok = linksRoom(out.results, CANARY.roomId);
    reg.logUsage({
      provider: p.name,
      al: CANARY.al,
      cost: out.cost,
      results: out.results.length,
      status: 'validation',
    });
    reg.setProviderState(p.name, {
      validated_at: nowSec(),
      validation_error: ok ? null : `canary ${CANARY.al}/AL did not return room ${CANARY.roomId}`,
      ...(out.remaining != null ? { last_remaining: out.remaining } : {}),
    });
    if (ok) reg.cachePut(CANARY.al, p.name, `"${CANARY.al}/AL"`, out.results);
    return ok;
  } catch (err) {
    if (signal?.aborted) throw err;
    markFailure(p, err, CANARY.al);
    return false;
  }
}

// Providers that could take a search right now (no network calls).
function usableProviders() {
  return ordered().filter((p) => {
    if (!p.configured()) return false;
    const s = stateFor(p);
    if (isExhausted(s)) return false;
    if (validationFresh(s) && s.validation_error) return false;
    return true;
  });
}

async function searchAl(al, signal) {
  const query = `"${al}/AL"`;

  // Any provider's cached answer for this AL is reused, whatever its order.
  for (const p of ordered()) {
    const c = reg.cacheGet(al, p.name);
    if (c) return { provider: p.name, results: c.results, cached: true };
  }

  for (const p of usableProviders()) {
    if (signal?.aborted) throw new Error('Aborted');
    if (!(await ensureValidated(p, signal))) continue;
    // The validation search may have just answered this very AL.
    const fresh = reg.cacheGet(al, p.name);
    if (fresh) return { provider: p.name, results: fresh.results, cached: true };
    try {
      const out = await p.search(query, signal);
      reg.cachePut(al, p.name, query, out.results);
      reg.logUsage({ provider: p.name, al, cost: out.cost, results: out.results.length, status: 'ok' });
      if (out.remaining != null) reg.setProviderState(p.name, { last_remaining: out.remaining });
      return { provider: p.name, results: out.results, cached: false };
    } catch (err) {
      if (signal?.aborted) throw err;
      markFailure(p, err, al);
      // Fall through: the same AL goes to the next provider.
    }
  }
  return { exhausted: true };
}

// Credits panel. `refresh` asks providers that expose a balance endpoint.
async function providerStatus({ refresh = false } = {}) {
  const usage = reg.usageByProvider();
  const out = [];
  for (const p of ordered()) {
    const configured = p.configured();
    let s = configured ? stateFor(p) : reg.getProviderState(p.name);
    if (configured && refresh && p.remaining && !isExhausted(s)) {
      try {
        const rem = await p.remaining();
        if (rem != null) reg.setProviderState(p.name, { last_remaining: rem });
      } catch (err) {
        logger.warn(`balance check failed for ${p.name}: ${err.message}`);
      }
      s = reg.getProviderState(p.name);
    }
    const u = usage.get(p.name) || {};
    out.push({
      name: p.name,
      configured,
      costPerQuery: p.costPerQuery,
      unit: p.unit,
      exhaustedUntil: s?.exhausted_until && s.exhausted_until > nowSec() ? s.exhausted_until : null,
      lastError: s?.last_error || null,
      validatedAt: s?.validated_at || null,
      validationError: s?.validation_error || null,
      remaining: s?.last_remaining ?? null,
      calls: u.calls || 0,
      spent: u.cost || 0,
      lastUsedAt: u.lastTs || null,
    });
  }
  const next = usableProviders()[0] || null;
  return {
    providers: out,
    next: next ? { name: next.name, costPerQuery: next.costPerQuery, unit: next.unit } : null,
  };
}

module.exports = { searchAl, providerStatus, usableProviders, CANARY };
