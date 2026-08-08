// Lightweight tracker check: load the host profile page and read only the
// declared listing count ("View all 36 listings"). No modal, no scrolling,
// no per-listing visits — seconds instead of minutes, one page load per host.

const { randomDelay } = require('../lib/delay');
const { readDeclaredCount } = require('./declaredCount');
const { dismissCookieBanner } = require('./hostProfile');

async function scrapeHostCount(page, profileUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubHostCount(profileUrl);

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page
    .waitForSelector('a[href*="/rooms/"]', { timeout: 30_000 })
    .catch(() => {}); // count text can render before/without room anchors
  await randomDelay(2500, 4000, signal);
  await dismissCookieBanner(page);

  const listingsCount = await readDeclaredCount(page);
  return { listingsCount };
}

function stubHostCount(profileUrl) {
  // Deterministic base count per host with a small day-to-day wobble so
  // stub-mode evolution charts show movement.
  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  const seed = parseInt((idMatch ? idMatch[1] : '0').slice(-3), 10) || 1;
  const day = Math.floor(Date.now() / 86_400_000);
  const wobble = ((seed + day) % 5) - 2; // -2..+2
  return { listingsCount: Math.max(1, 4 + (seed % 40) + wobble) };
}

module.exports = { scrapeHostCount };
