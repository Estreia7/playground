// Shared plumbing for the paid Google-search providers.
//
// Every provider module exports the same shape:
//   name, envKeys, costPerQuery, unit,
//   configured()           → key present?
//   search(query, signal)  → { results: [{ title, link, snippet }], cost, remaining? }
//   remaining?(signal)     → number | null   (account balance, when the API has one)
// and throws ProviderError(kind) with kind 'quota' | 'auth' | 'transient'.
// `link` is always the FINAL listing URL (redirect wrappers resolved), so the
// chain filters every provider's answer the same way.

class ProviderError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const QUOTA_RE = /credit|quota|exhaust|run out|limit reached|not enough|insufficient|upgrade/i;

// Map an HTTP failure to a ProviderError kind. 401 is a bad key; 402/429 and
// any "out of credits" wording is exhaustion; 403 is ambiguous across vendors
// (ScraperAPI uses it for exhausted credits), so the message decides.
function errorFromResponse(status, bodyText) {
  const msg = `HTTP ${status} ${String(bodyText || '').slice(0, 160)}`;
  if (status === 401) return new ProviderError('auth', msg);
  if (status === 402 || status === 429) return new ProviderError('quota', msg);
  if (status === 403) return new ProviderError(QUOTA_RE.test(bodyText) ? 'quota' : 'auth', msg);
  if (status === 400 && QUOTA_RE.test(bodyText)) return new ProviderError('quota', msg);
  return new ProviderError('transient', msg);
}

async function fetchJson(url, init = {}, timeoutMs = 90_000) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError('transient', err.message);
  }
  const text = await res.text();
  if (!res.ok) throw errorFromResponse(res.status, text);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError('transient', `non-JSON response: ${text.slice(0, 120)}`);
  }
  // Some APIs answer 200 with an error body.
  if (json && typeof json.error === 'string' && !json.organic_results && !json.organic) {
    throw errorFromResponse(QUOTA_RE.test(json.error) ? 429 : 500, json.error);
  }
  return { json, headers: res.headers };
}

function normalize(items, { title = 'title', link = 'link', snippet = 'snippet' } = {}) {
  return (items || [])
    .filter((o) => o && o[link])
    .map((o) => ({ title: o[title] || '', link: o[link], snippet: o[snippet] || '' }));
}

module.exports = { ProviderError, errorFromResponse, fetchJson, normalize };
