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

// Sized for mega-hosts: a 300-listing modal takes ~25 Show-more clicks, each
// consuming one round; the loop still exits early via declared-count or the
// stale counter for small hosts.
const MAX_SCROLL_ROUNDS = 90;

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

async function scrapeHostProfile(page, profileUrl, signal, onProgress) {
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

  // Expand the listings modal when present. The text MUST mention listings:
  // a looser "show all N" once matched "Show all 90 reviews" and opened the
  // reviews modal instead, capping discovery at the ~10 carousel cards.
  const viewAll = page
    .locator('a, button')
    .filter({ hasText: /(view|show) all \d+ listings?|ver todos os \d+ an[uú]ncios/i })
    .first();
  let modalOpened = false;
  try {
    await viewAll.waitFor({ timeout: 8000 });
    await viewAll.click({ timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 }).catch(() => {});
    await randomDelay(2000, 3500, signal);
    modalOpened = true;
  } catch {
    // No view-all affordance; fall through to carousel paging.
  }

  // Carousel variant: page through with the "Next listings" arrow, harvesting
  // as cards rotate through the DOM.
  if (!modalOpened) {
    const nextArrow = page.getByRole('button', {
      name: /next listings|pr[óo]ximos an[uú]ncios/i,
    });
    for (let i = 0; i < 400; i++) {
      if (signal?.aborted) throw new Error('Aborted');
      const visible = await nextArrow
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (!visible) break;
      if (await nextArrow.first().isDisabled().catch(() => true)) break;
      await nextArrow.first().click({ timeout: 3000 }).catch(() => {});
      await randomDelay(900, 1500, signal);
      merge(await harvestCards(page));
      if (onProgress) onProgress(seen.size);
      if (declared && seen.size >= declared) break;
    }
  }

  // Harvest / scroll / "Show more listings" loop. The modal grid loads ~12
  // cards per click of the bottom button; harvest EVERY round so nothing is
  // lost if earlier cards leave the DOM. Every locator action here carries a
  // SHORT timeout: a hidden matched button once burned 25 rounds x 35s of
  // scroll-into-view retries, freezing the whole job for a quarter hour.
  let stale = 0;
  let clickFailures = 0;
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
    if (onProgress) onProgress(seen.size);
    if (declared && seen.size >= declared) break;

    const dialog = page.locator('[role="dialog"]').first();
    const inDialog = (await dialog.count()) > 0;
    // Outside the dialog only the explicit "Show more listings" label is safe
    // to click — the profile page has unrelated "Show more" buttons. Only a
    // VISIBLE button counts; hidden matches must not stall the loop.
    const more = (inDialog ? dialog : page)
      .locator('button:visible')
      .filter({
        hasText: inDialog
          ? /show more listings|mostrar mais|show more/i
          : /show more listings|mostrar mais an[uú]ncios/i,
      })
      .first();
    const hasMore = await more.isVisible({ timeout: 1500 }).catch(() => false);

    if (hasMore && clickFailures < 2) {
      try {
        await more.scrollIntoViewIfNeeded({ timeout: 3000 });
        await more.click({ timeout: 4000 });
        await randomDelay(1500, 2500, signal);
        clickFailures = 0;
        stale = 0;
      } catch (err) {
        clickFailures += 1;
        logger.warn(`show-more-listings click failed (${clickFailures}):`, err.message);
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
