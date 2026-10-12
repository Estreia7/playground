// ScraperAPI structured Google Search — ~25 credits per query, so it sits at
// the end of the chain. Proven 2026-10-12 (found 178074 from country_code=pt).
// organic_results[].link is a google.*/goto?url=… wrapper: a GET without
// following redirects answers 302 with the real airbnb.*/rooms/<id> URL.
// Balance: GET /account → requestLimit - requestCount.

const { fetchJson, normalize } = require('./common');

const KEY = () => process.env.SCRAPERAPI_KEY || '';

async function resolveGoto(link) {
  if (!/\/goto\?|\/url\?/.test(link)) return link;
  try {
    const r = await fetch(link, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20_000),
    });
    return r.headers.get('location') || link;
  } catch {
    return link;
  }
}

module.exports = {
  name: 'scraperapi',
  envKeys: ['SCRAPERAPI_KEY'],
  costPerQuery: 25,
  unit: 'credit',
  configured: () => !!KEY(),
  key: KEY,
  async search(query, signal) {
    const u = new URL('https://api.scraperapi.com/structured/google/search');
    u.searchParams.set('api_key', KEY());
    u.searchParams.set('query', query);
    u.searchParams.set('country_code', 'pt');
    const { json } = await fetchJson(u, { signal });
    const results = normalize(json.organic_results);
    for (const r of results) r.link = await resolveGoto(r.link);
    return { results, cost: 25 };
  },
  async remaining(signal) {
    const u = new URL('https://api.scraperapi.com/account');
    u.searchParams.set('api_key', KEY());
    const { json } = await fetchJson(u, { signal }, 30_000);
    const limit = Number(json.requestLimit);
    const used = Number(json.requestCount);
    return Number.isFinite(limit) && Number.isFinite(used) ? Math.max(0, limit - used) : null;
  },
};
