// SerpApi — Google results, 1 search per query; the free plan renews monthly.
// Out of searches → HTTP 429 { error: "Your account has run out of searches." };
// bad key → 401. Balance: GET /account.json (free) → total_searches_left.

const { fetchJson, normalize } = require('./common');

const KEY = () => process.env.SERPAPI_KEY || '';

module.exports = {
  name: 'serpapi',
  envKeys: ['SERPAPI_KEY'],
  costPerQuery: 1,
  unit: 'search',
  monthlyReset: true,
  configured: () => !!KEY(),
  key: KEY,
  async search(query, signal) {
    const u = new URL('https://serpapi.com/search.json');
    u.searchParams.set('engine', 'google');
    u.searchParams.set('q', query);
    u.searchParams.set('google_domain', 'google.pt');
    u.searchParams.set('gl', 'pt');
    u.searchParams.set('hl', 'pt');
    u.searchParams.set('api_key', KEY());
    const { json } = await fetchJson(u, { signal });
    return { results: normalize(json.organic_results), cost: 1 };
  },
  async remaining(signal) {
    const u = new URL('https://serpapi.com/account.json');
    u.searchParams.set('api_key', KEY());
    const { json } = await fetchJson(u, { signal }, 30_000);
    return Number.isFinite(json.total_searches_left) ? json.total_searches_left : null;
  },
};
