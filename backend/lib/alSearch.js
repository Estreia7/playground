// AL → Airbnb listing helpers shared by the registry workers.
//
//   bingCandidates(page, al)   free: Bing for '"<al>/AL" airbnb', room ids from
//                              the result links (Bing wraps them in a u=a1<b64>
//                              redirect we decode locally).
//   candidatesFromResults(…)   paid-search results → room ids, exact-AL
//                              snippets first (others are checked too: free).
//   verifyListing(page, …)     open /rooms/<id>; the licence only exists in the
//                              rendered page (a plain fetch never has it).
//
// A listing that redirects away from /rooms/<id> is either delisted or a
// throttle bounce; one slow retry tells them apart.

const { extractHost } = require('../scraper/extractHost');
const { randomDelay } = require('./delay');

const ROOM_RE = /airbnb\.[a-z.]+\/rooms\/(?:plus\/)?(\d+)/i;
const MAX_LOOSE_CANDIDATES = 3;

function alRe(al) {
  return new RegExp(`(^|\\D)${al}\\s*/\\s*AL\\b`, 'i');
}

function decodeBing(href) {
  const m = href.match(/[?&]u=a1([^&]+)/);
  if (!m) return href;
  try {
    return Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  } catch {
    return href;
  }
}

async function bingCandidates(page, al) {
  if (process.env.SCRAPER_STUB === '1') return [];
  await page.goto(
    'https://www.bing.com/search?q=' + encodeURIComponent(`"${al}/AL" airbnb`),
    { waitUntil: 'domcontentloaded', timeout: 30_000 }
  );
  await page.waitForTimeout(2500);
  const hrefs = await page.$$eval('li.b_algo h2 a', (as) => as.map((a) => a.href)).catch(() => []);
  const ids = [];
  for (const h of hrefs) {
    const m = decodeBing(h).match(ROOM_RE);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids.slice(0, MAX_LOOSE_CANDIDATES);
}

// Exact-AL airbnb hits first; a few loose airbnb hits after (verification is
// free, and some providers trim the snippet).
function candidatesFromResults(results, al) {
  const re = alRe(al);
  const exact = [];
  const loose = [];
  for (const r of results || []) {
    const m = String(r.link || '').match(ROOM_RE);
    if (!m) continue;
    const bucket = re.test(`${r.snippet} ${r.title}`) ? exact : loose;
    if (!exact.includes(m[1]) && !loose.includes(m[1])) bucket.push(m[1]);
  }
  return { exact, loose: loose.slice(0, MAX_LOOSE_CANDIDATES) };
}

async function openListing(page, roomId) {
  await page.goto(`https://www.airbnb.com/rooms/${roomId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page
    .waitForSelector('[data-section-id="DESCRIPTION_DEFAULT"]', { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  return new RegExp(`/rooms/(?:plus/)?${roomId}\\b`).test(page.url());
}

// → { status: 'verified' | 'other-al' | 'delisted' | 'error', roomId, title,
//     shownAl, hostId, hostUrl, hostName, error }
async function verifyListing(page, roomId, al, { signal, withHost = true } = {}) {
  if (process.env.SCRAPER_STUB === '1') return { status: 'error', roomId, error: 'stub' };
  try {
    let onListing = await openListing(page, roomId);
    if (!onListing) {
      // Could be Airbnb bouncing a fast client to the homepage: wait, retry once.
      await randomDelay(15_000, 25_000, signal);
      onListing = await openListing(page, roomId);
      if (!onListing) return { status: 'delisted', roomId };
    }
    const html = await page.content();
    // "<name> - Apartments for Rent in Albufeira, … - Airbnb" → "<name>"
    // (names may contain " - " themselves, so strip only the known tail).
    const title =
      (await page.title())
        .replace(/\s+-\s+Airbnb\s*$/i, '')
        .replace(/\s+-\s+[^-]*\bfor Rent in\b.*$/i, '')
        .trim() || null;
    if (!alRe(al).test(html)) {
      const shown = (html.match(/(\d{3,9})\s*\/\s*AL\b/i) || [])[1] || null;
      return { status: 'other-al', roomId, title, shownAl: shown };
    }
    const host = withHost ? await extractHost(page) : {};
    return { status: 'verified', roomId, title, ...host };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { status: 'error', roomId, error: err.message.slice(0, 200) };
  }
}

module.exports = { bingCandidates, candidatesFromResults, verifyListing, alRe, ROOM_RE };
