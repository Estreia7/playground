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

// Collect whatever listing cards are in the DOM right now.
// Called repeatedly while scrolling/clicking, so a virtualized grid (cards
// dropping out of the DOM) still gets fully harvested.
async function harvestCards(page) {
  return page
    .evaluate(() => {
      const found = [];
      for (const a of document.querySelectorAll('a[href*="/rooms/"]')) {
        const m = (a.getAttribute('href') || '').match(/\/rooms\/(?:plus\/)?(\d+)/);
        if (!m) continue;
        const roomId = m[1];

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

        found.push({
          roomId,
          url: `https://www.airbnb.com/rooms/${roomId}`,
          title: title || null,
          locationText: locationText || null,
          reviewsScore,
          reviewsCount,
        });
      }
      return found;
    })
    .catch(() => []);
}

async function scrapeHostProfile(page, profileUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubHostProfile(profileUrl);
  if (signal?.aborted) throw new Error('Aborted');

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Wait for actual listing cards, not just the page frame — the listings
  // section hydrates late on heavy profiles (a 48-listing host previously
  // raced this and only the ~10 carousel cards were caught).
  await page.waitForSelector('a[href*="/rooms/"]', { timeout: 30_000 }).catch(() => {});
  await randomDelay(2500, 4000, signal);

  await dismissCookieBanner(page);

  const seen = new Map();
  function merge(cards) {
    let added = 0;
    for (const c of cards) {
      if (!seen.has(c.roomId)) {
        seen.set(c.roomId, c);
        added += 1;
      }
    }
    return added;
  }
  merge(await harvestCards(page));

  // Declared listing count, read early: "View all 48 listings" / "N listings".
  const declared = await page
    .evaluate(() => {
      const body = document.body?.innerText || '';
      const cm =
        body.match(/(?:view|show) all (\d+) listings?/i) ||
        body.match(/(\d+)\s+listings?\b/i) ||
        body.match(/listings?\s*\((\d+)\)/i) ||
        body.match(/(\d+)\s+an[uú]ncios?\b/i);
      return cm ? parseInt(cm[1], 10) : null;
    })
    .catch(() => null);

  // Expand the listings modal when present ("View all N listings").
  const viewAll = page
    .locator('a, button')
    .filter({ hasText: /view all \d+|show all \d+|ver todos/i })
    .first();
  try {
    await viewAll.waitFor({ timeout: 8000 });
    await viewAll.click({ timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 }).catch(() => {});
    await randomDelay(2000, 3500, signal);
  } catch {
    // Small hosts have no view-all affordance; the carousel is everything.
  }

  // Harvest / scroll / "Show more listings" loop. The modal grid loads ~12
  // cards per click of the bottom button; harvest EVERY round so nothing is
  // lost if earlier cards leave the DOM.
  let stale = 0;
  for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
    if (signal?.aborted) throw new Error('Aborted');

    await page
      .evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return;
        for (const el of [dlg, ...dlg.querySelectorAll('*')]) {
          if (el.scrollHeight > el.clientHeight + 50) {
            el.scrollTop += el.clientHeight * 0.8;
            return;
          }
        }
      })
      .catch(() => {});
    await randomDelay(1000, 1800, signal);

    const added = merge(await harvestCards(page));
    if (declared && seen.size >= declared) break;

    const dialog = page.locator('[role="dialog"]').first();
    const inDialog = (await dialog.count()) > 0;
    // Outside the dialog only the explicit "Show more listings" label is safe
    // to click — the profile page has unrelated "Show more" buttons.
    const more = (inDialog ? dialog : page)
      .locator('button')
      .filter({
        hasText: inDialog
          ? /show more listings|mostrar mais|show more/i
          : /show more listings|mostrar mais an[uú]ncios/i,
      })
      .first();
    const hasMore = (await more.count()) > 0;

    if (hasMore) {
      stale = 0;
      try {
        await more.scrollIntoViewIfNeeded();
        await more.click({ timeout: 5000 });
        await randomDelay(1500, 2500, signal);
      } catch (err) {
        logger.warn('show-more-listings click failed:', err.message);
        stale += 1;
      }
    } else if (added === 0) {
      stale += 1;
      if (stale >= 3) break;
    } else {
      stale = 0;
    }
  }
  merge(await harvestCards(page));

  if (declared && seen.size < declared) {
    logger.warn(`host profile: found ${seen.size} of ${declared} declared listings`);
  }

  // Host identity, read from whatever is on screen now.
  const identity = await page
    .evaluate(() => {
      const out = { hostName: null };
      const headings = Array.from(document.querySelectorAll('h1, h2')).map((h) =>
        (h.innerText || '').trim()
      );
      for (const t of headings) {
        const m =
          t.match(/^(?:about|acerca de|sobre)\s+(.{1,60})$/i) ||
          t.match(/^(.{1,60})['’]s listings$/i) ||
          t.match(/(?:hi,?\s+i['’]m|olá,?\s+sou\s+o?a?)\s+(.{1,60})/i);
        if (m) {
          out.hostName = m[1].trim();
          break;
        }
      }
      if (!out.hostName) {
        const t = (document.title || '').split(/\s[-–|·]\s/)[0].trim();
        if (t && !/airbnb|host profile/i.test(t)) out.hostName = t;
      }
      return out;
    })
    .catch(() => ({ hostName: null }));

  const listings = Array.from(seen.values()).map(({ roomId: _roomId, ...rest }) => rest);
  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  return {
    hostId: idMatch ? idMatch[1] : null,
    hostUrl: profileUrl,
    hostName: identity.hostName,
    listingsCount: declared ?? listings.length,
    listings,
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
