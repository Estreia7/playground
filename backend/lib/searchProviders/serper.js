// Serper.dev — Google results, 1 credit per query. Validated 2026-10-12:
// '"178074/AL"' → airbnb.pt/rooms/1681250956240216550 with the exact snippet.
// Response: { searchParameters, organic: [{ title, link, snippet, position }], credits }.
// No displayed_link; links are already the final URLs.

const { fetchJson, normalize } = require('./common');

const KEY = () => process.env.SERPER_API_KEY || '';

module.exports = {
  name: 'serper',
  envKeys: ['SERPER_API_KEY'],
  costPerQuery: 1,
  unit: 'credit',
  configured: () => !!KEY(),
  key: KEY,
  async search(query, signal) {
    const { json } = await fetchJson('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'pt', hl: 'pt-pt' }),
      signal,
    });
    return { results: normalize(json.organic), cost: Number(json.credits) || 1 };
  },
};
