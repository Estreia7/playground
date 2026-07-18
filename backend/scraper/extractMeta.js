// Extract listing-level metadata that doesn't change month to month:
//   - title:        the listing's display name (e.g. "Sunny loft in Alfama")
//   - reviewsCount: number of guest reviews
//   - reviewsScore: overall rating (e.g. 4.87)
//
// This runs ONCE per listing, before the 12-month ADR loop. We navigate to
// the plain listing URL and read from three sources, most reliable first:
//   1. The embedded JSON-LD (<script type="application/ld+json">) — Airbnb
//      ships a Product/aggregateRating block that survives most A/B buckets.
//   2. The <title>/<h1> for the name, and the "★ 4.87 · 123 reviews" summary
//      row for the rating.
// Anything we can't read comes back null; the caller stores what it has.

const logger = require('../lib/logger');
const { randomDelay } = require('../lib/delay');

async function extractMeta(page, listingUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') {
    return stubMeta(listingUrl);
  }
  if (signal?.aborted) throw new Error('Aborted');

  const plainUrl = stripQuery(listingUrl);
  await page.goto(plainUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('h1, [data-section-id], main', { timeout: 25_000 }).catch(() => {});
  await randomDelay(1200, 2200, signal);

  const meta = await page.evaluate(() => {
    const out = { title: null, reviewsCount: null, reviewsScore: null };

    // --- 1. JSON-LD aggregateRating -------------------------------------
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || '');
        const nodes = Array.isArray(data) ? data : [data];
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          if (node.name && !out.title) out.title = String(node.name).trim();
          const agg = node.aggregateRating;
          if (agg) {
            if (agg.ratingValue != null && out.reviewsScore == null) {
              const v = parseFloat(String(agg.ratingValue).replace(',', '.'));
              if (Number.isFinite(v)) out.reviewsScore = v;
            }
            const count = agg.reviewCount ?? agg.ratingCount;
            if (count != null && out.reviewsCount == null) {
              const n = parseInt(String(count).replace(/[^\d]/g, ''), 10);
              if (Number.isFinite(n)) out.reviewsCount = n;
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD blocks
      }
    }

    // --- 2. Title fallbacks ---------------------------------------------
    if (!out.title) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.innerText.trim()) out.title = h1.innerText.trim();
    }
    if (!out.title && document.title) {
      // "Sunny loft in Alfama - Apartments for Rent in Lisbon - Airbnb"
      out.title = document.title.split(/\s[-–|]\s/)[0].trim() || null;
    }

    // --- 3. Rating / count from the visible summary text ----------------
    const bodyText = document.body?.innerText || '';
    if (out.reviewsScore == null) {
      // "★ 4.87" or "4.87 · 123 reviews" or "Rated 4.87 out of 5"
      const m =
        bodyText.match(/★\s*([0-5](?:[.,]\d{1,2})?)/) ||
        bodyText.match(/\b([0-5][.,]\d{1,2})\b(?=[^\n]{0,20}(?:review|·))/i) ||
        bodyText.match(/rated\s+([0-5][.,]\d{1,2})\s+out of 5/i);
      if (m) {
        const v = parseFloat(m[1].replace(',', '.'));
        if (Number.isFinite(v) && v >= 0 && v <= 5) out.reviewsScore = v;
      }
    }
    if (out.reviewsCount == null) {
      // "123 reviews" / "1,234 reviews" / "· 123 reviews"
      const m = bodyText.match(/([\d.,]+)\s+reviews?\b/i);
      if (m) {
        const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
        if (Number.isFinite(n)) out.reviewsCount = n;
      }
    }

    return out;
  });

  return meta;
}

function stripQuery(u) {
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return u;
  }
}

function stubMeta(listingUrl) {
  const m = listingUrl.match(/\/rooms\/(\d+)/);
  const id = m ? m[1] : '000';
  const seed = parseInt(id.slice(-3), 10) || 0;
  return {
    title: `Stub Listing ${id}`,
    reviewsCount: 20 + (seed % 300),
    reviewsScore: Math.round((4.2 + (seed % 80) / 100) * 100) / 100,
  };
}

module.exports = { extractMeta };
