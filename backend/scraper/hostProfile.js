// Scrape an Airbnb host profile page: host identity + the full set of
// listings (URL always; title/location/rating best-effort from the cards —
// the later per-listing visit is the authoritative source for meta).
//
// The profile is a heavily client-rendered React page, so we work the DOM:
//   1. Navigate, dismiss the cookie banner.
//   2. Click any "View all N listings" affordance when present.
//   3. Scroll until the /rooms/ anchor count stops growing.
//   4. Collect one entry per unique room id, with the card's text lines.

const logger = require('../lib/logger');
const { randomDelay } = require('../lib/delay');

const MAX_SCROLL_ROUNDS = 25;

async function scrapeHostProfile(page, profileUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubHostProfile(profileUrl);
  if (signal?.aborted) throw new Error('Aborted');

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('main, h1, h2', { timeout: 30_000 }).catch(() => {});
  await randomDelay(2000, 3500, signal);

  await dismissCookieBanner(page);

  // Expand the listings section when the profile tucks it behind a
  // "View all N listings" link/button.
  const viewAll = page
    .locator('a, button')
    .filter({ hasText: /view all \d+|show all \d+|ver todos/i })
    .first();
  if (await viewAll.count()) {
    try {
      await viewAll.click({ timeout: 5000 });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await randomDelay(2000, 3500, signal);
    } catch (err) {
      logger.warn('view-all click failed (continuing with visible cards):', err.message);
    }
  }

  // Scroll to force lazy card loading until the anchor count plateaus.
  let prevCount = -1;
  for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
    if (signal?.aborted) throw new Error('Aborted');
    const count = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.querySelectorAll('a[href*="/rooms/"]').length;
    });
    await randomDelay(900, 1600, signal);
    if (count === prevCount) break;
    prevCount = count;
  }

  const data = await page.evaluate(() => {
    const out = { hostName: null, listingsCount: null, listings: [] };

    // Host name: "Hi, I'm X" heading or the first h1/h2.
    const headings = Array.from(document.querySelectorAll('h1, h2')).map((h) =>
      (h.innerText || '').trim()
    );
    for (const t of headings) {
      const m = t.match(/(?:hi,?\s+i['’]m|olá,?\s+sou\s+o?a?)\s+(.{1,60})/i);
      if (m) {
        out.hostName = m[1].trim();
        break;
      }
    }
    if (!out.hostName) {
      // Page title tends to be "<Name> - Airbnb".
      const t = (document.title || '').split(/\s[-–|]\s/)[0].trim();
      if (t && !/airbnb/i.test(t)) out.hostName = t;
    }

    // Declared listing count: "14 listings" / "Listings (14)" / "14 anúncios".
    const body = document.body?.innerText || '';
    const cm =
      body.match(/(\d+)\s+listings?\b/i) ||
      body.match(/listings?\s*\((\d+)\)/i) ||
      body.match(/(\d+)\s+an[uú]ncios?\b/i);
    if (cm) out.listingsCount = parseInt(cm[1], 10);

    // Listing cards: dedupe anchors by room id, keep the card's text lines.
    const seen = new Map();
    for (const a of document.querySelectorAll('a[href*="/rooms/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/rooms\/(?:plus\/)?(\d+)/);
      if (!m) continue;
      const roomId = m[1];
      if (seen.has(roomId)) continue;

      const card = a.closest('[data-testid], article, li, div') || a;
      const lines = (card.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      let title = null;
      let locationText = null;
      let reviewsScore = null;
      let reviewsCount = null;

      for (const line of lines) {
        // "4.85 (23)" / "4,85 · 23 reviews" rating fragments.
        const rm = line.match(/^([0-5][.,]\d{1,2})\s*[·(]?\s*(\d+)?/);
        if (rm && reviewsScore === null && parseFloat(rm[1].replace(',', '.')) <= 5) {
          reviewsScore = parseFloat(rm[1].replace(',', '.'));
          if (rm[2]) reviewsCount = parseInt(rm[2], 10);
          continue;
        }
        // "Apartment in Albufeira" style card subtitle.
        if (!locationText && /\b(in|em)\s+[A-ZÀ-Ú]/.test(line) && line.length < 80) {
          locationText = line;
          continue;
        }
        if (!title && line.length > 3 && !/^€|\bnight\b|\bnoite\b/i.test(line)) {
          title = line;
        }
      }

      const label = (a.getAttribute('aria-label') || '').trim();
      if (label && (!title || title.length < 4)) title = label;

      seen.set(roomId, {
        url: `https://www.airbnb.com/rooms/${roomId}`,
        title: title || null,
        locationText: locationText || null,
        reviewsScore,
        reviewsCount,
      });
    }
    out.listings = Array.from(seen.values());
    return out;
  });

  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  return {
    hostId: idMatch ? idMatch[1] : null,
    hostUrl: profileUrl,
    hostName: data.hostName,
    listingsCount: data.listingsCount ?? data.listings.length,
    listings: data.listings,
  };
}

async function dismissCookieBanner(page) {
  try {
    const btn = page
      .locator('button')
      .filter({ hasText: /^(ok|accept|accept all|aceitar|got it)$/i })
      .first();
    if (await btn.count()) await btn.click({ timeout: 3000 });
  } catch {
    // banner variants come and go; never fail the scrape over it
  }
}

function stubHostProfile(profileUrl) {
  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  const hostId = idMatch ? idMatch[1] : '0';
  const seed = parseInt(hostId.slice(-2), 10) || 1;
  const n = 4 + (seed % 4);
  const listings = Array.from({ length: n }, (_, i) => ({
    url: `https://www.airbnb.com/rooms/9${hostId.slice(-4)}${i}`,
    title: `Stub Listing ${i + 1} of host ${hostId.slice(-4)}`,
    locationText: `Apartment in ${['Albufeira', 'Lagos', 'Portimão', 'Loulé'][i % 4]}`,
    reviewsScore: Math.round((3.9 + ((seed + i) % 11) / 10) * 100) / 100,
    reviewsCount: 3 + ((seed * (i + 3)) % 220),
  }));
  return {
    hostId,
    hostUrl: profileUrl,
    hostName: `Stub Host ${hostId.slice(-4)}`,
    listingsCount: n,
    listings,
  };
}

module.exports = { scrapeHostProfile };
