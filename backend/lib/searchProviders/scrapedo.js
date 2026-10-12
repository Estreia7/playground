// scrape.do Google Search plugin — 10 credits per query. NOT trusted yet:
// the 2026-10-12 tests returned non-Portuguese junk that ignored the exact
// quotes, so the chain only uses it after it passes the canary validation.
// Balance comes back on every success in the Scrape.do-Remaining-Credits header.

const { fetchJson, normalize } = require('./common');

const KEY = () => process.env.SCRAPEDO_TOKEN || '';

module.exports = {
  name: 'scrapedo',
  envKeys: ['SCRAPEDO_TOKEN'],
  costPerQuery: 10,
  unit: 'credit',
  configured: () => !!KEY(),
  key: KEY,
  async search(query, signal) {
    const u = new URL('https://api.scrape.do/plugin/google/search');
    u.searchParams.set('token', KEY());
    u.searchParams.set('q', query);
    u.searchParams.set('google_domain', 'google.pt');
    u.searchParams.set('gl', 'pt');
    u.searchParams.set('hl', 'pt');
    u.searchParams.set('start', '0');
    const { json, headers } = await fetchJson(u, { signal });
    const rem = parseInt(headers.get('scrape.do-remaining-credits'), 10);
    return {
      results: normalize(json.organic_results),
      cost: 10,
      remaining: Number.isFinite(rem) ? rem : undefined,
    };
  },
};
