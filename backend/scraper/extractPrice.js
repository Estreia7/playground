// Extract the price a guest actually pays for a given check_in/check_out
// window, divided later by nights to get the effective nightly rate.
//
// Strategy:
//   1. Navigate to the listing URL with ?check_in=YYYY-MM-DD&check_out=...
//      &adults=2&currency=... (currency from env).
//   2. Wait for the booking widget to render (or for the "not available"
//      banner).
//   3. If the widget contains "Those dates are not available" / similar →
//      return null so the caller skips this window.
//   4. Otherwise, read the displayed total. Prefer the "Total" row that
//      appears after clicking the "€X total" link (it's the authoritative
//      number that includes cleaning + service fees), but fall back to the
//      inline "€X total" text in the widget if the popup doesn't open.
//
// We treat what we extract as THE PRICE THE GUEST PAYS. We never strip
// fees back out — guests pay cleaning, so cleaning belongs in the total.

const logger = require('../lib/logger');
const { randomDelay } = require('../lib/delay');

// Phrases that indicate the booking widget rendered an error rather than
// a price. We look for these in the widget itself (not the whole body) so
// generic terms like "not available" elsewhere on the page don't confuse us.
const NOT_AVAILABLE_PHRASES = [
  'those dates are not available',
  'dates not available',
  'minimum stay',
  'unavailable',
];

async function extractPrice(page, sample) {
  if (process.env.SCRAPER_STUB === '1') {
    return stubPrice(sample);
  }

  const listingUrl = currentListingUrl(page);
  if (!listingUrl) throw new Error('extractPrice: page has no listing URL');

  const url = buildBookingUrl(listingUrl, sample);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  // Wait for the booking widget area to render. Airbnb labels it inconsistently
  // across A/B test buckets, so we accept several markers.
  await page
    .waitForSelector(
      '[data-section-id="BOOK_IT_SIDEBAR"], [data-testid="book-it-section"], [data-section-id="BOOK_IT_MOBILE"], main',
      { timeout: 25_000 }
    )
    .catch(() => {});

  await randomDelay(1200, 2200);

  // Two strategies, in order:
  //   (a) Read "€X total" directly from the booking widget area.
  //   (b) If that fails, click the "X total" link to open the breakdown
  //       popup and read the "Total" row.
  let total = await readInlineTotal(page);

  if (total == null) {
    const opened = await openBreakdown(page);
    if (opened) {
      await randomDelay(800, 1400);
      total = await readBreakdownTotal(page);
    }
  }

  if (total == null) {
    // Last-chance check: are we looking at an error widget?
    const widgetText = await readWidgetText(page);
    if (widgetText && NOT_AVAILABLE_PHRASES.some((p) => widgetText.toLowerCase().includes(p))) {
      logger.info(`extractPrice: dates unavailable for ${sample.start}..${sample.end} (${widgetText.slice(0, 80)})`);
    } else {
      logger.warn(`extractPrice: could not read price for ${sample.start}..${sample.end}`);
    }
    return null;
  }

  return {
    totalPrice: total,
    currency: process.env.CURRENCY || 'EUR',
    nights: sample.nights,
  };
}

async function openBreakdown(page) {
  try {
    return await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], [data-testid*="price"], [data-testid*="total"]'
        )
      );
      const link = candidates.find((el) => {
        const t = (el.innerText || '').trim().toLowerCase();
        return t.length > 0 && t.length < 60 && /total/.test(t) && /[€$£]\s*[\d.,]+/.test(t);
      });
      if (link) {
        link.click();
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

async function readWidgetText(page) {
  return page.evaluate(() => {
    const sels = [
      '[data-section-id="BOOK_IT_SIDEBAR"]',
      '[data-testid="book-it-section"]',
      '[data-section-id="BOOK_IT_MOBILE"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el.innerText || '';
    }
    return '';
  });
}

async function readBreakdownTotal(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('div, li, tr'));
    for (const r of rows) {
      const t = (r.innerText || '').trim();
      if (!t) continue;
      // The breakdown popup has a final row literally labelled "Total" with
      // the €X.XX amount in the same row.
      const m = t.match(/^total[^\d€$£]*([€$£]\s*[\d.,]+)/i);
      if (m) {
        const n = parsePrice(m[1]);
        if (n) return n;
      }
    }
    return null;
  });
}

async function readInlineTotal(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    // Examples: "€ 1,299 total", "€1,299 total for 6 nights"
    const m =
      text.match(/([€$£]\s*[\d.,]+)\s+total/i) ||
      text.match(/total\s+([€$£]\s*[\d.,]+)/i);
    if (!m) return null;
    const raw = m[1].replace(/[^\d.,]/g, '');
    // Heuristic: if both . and , are present, the last one is the decimal sep.
    let normalised = raw;
    if (raw.includes(',') && raw.includes('.')) {
      if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
        normalised = raw.replace(/\./g, '').replace(',', '.');
      } else {
        normalised = raw.replace(/,/g, '');
      }
    } else if (raw.includes(',')) {
      const decimals = raw.split(',').pop();
      normalised = decimals.length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
    }
    const n = parseFloat(normalised);
    return Number.isFinite(n) ? n : null;
  });
}

function parsePrice(amountStr) {
  const raw = amountStr.replace(/[^\d.,]/g, '');
  let normalised = raw;
  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalised = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalised = raw.replace(/,/g, '');
    }
  } else if (raw.includes(',')) {
    const decimals = raw.split(',').pop();
    normalised = decimals.length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  const n = parseFloat(normalised);
  return Number.isFinite(n) ? n : null;
}

function currentListingUrl(page) {
  const u = page.url();
  if (!u || u === 'about:blank') return null;
  // Strip query string — we'll re-add the params we need.
  try {
    const parsed = new URL(u);
    if (!/\/rooms\/\d+/.test(parsed.pathname)) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function buildBookingUrl(listingUrl, sample) {
  const u = new URL(listingUrl);
  u.searchParams.set('check_in', sample.start);
  u.searchParams.set('check_out', sample.end);
  u.searchParams.set('adults', '2');
  const cur = process.env.CURRENCY;
  if (cur) u.searchParams.set('currency', cur);
  return u.toString();
}

function stubPrice(sample) {
  const month = parseInt(sample.start.split('-')[1], 10);
  const seasonality = [0.85, 0.85, 0.95, 1.05, 1.15, 1.25, 1.4, 1.45, 1.2, 1.05, 0.95, 1.1];
  const base = 75 + ((parseInt(sample.start.replace(/-/g, ''), 10) % 40));
  const totalPrice = Math.round(base * seasonality[month - 1] * sample.nights * 100) / 100;
  return { totalPrice, currency: process.env.CURRENCY || 'EUR', nights: sample.nights };
}

module.exports = { extractPrice };
