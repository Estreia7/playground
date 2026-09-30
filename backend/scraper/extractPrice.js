// The price a guest pays for one stay, always at the refundable rate.
//
// The listing page is opened with check_in / check_out in the address. As it
// loads, it asks Airbnb for its sections (StaysPdpSections), and the booking
// section of that answer carries the price, the rate options when there is
// more than one, and a plain yes/no on whether the stay can be booked. We read
// that answer (lib/bookItPrice.js) rather than the widget's text.
//
// Reading the text is what went wrong before. When a listing offers a
// discounted non-refundable rate, the widget's headline "€X total" is that
// discounted price, and the refundable one is further down. The old reader took
// the first "€X total" on the page, so those listings were stored at the
// non-refundable rate.
//
// If the answer never arrives (a changed API, a slow page), the widget text is
// still read as a fallback, and even then the "Refundable · €X total" line is
// preferred over the headline.
//
// Returns
//   { ok: true, totalPrice, nights, currency, rate }
//   { ok: false, reason: 'unavailable' | 'dates-changed' | 'no-price', message? }
// We never strip fees: guests pay cleaning, so cleaning belongs in the price.

const logger = require('../lib/logger');
const { randomDelay } = require('../lib/delay');
const { findBookIt, readBookItPrice, parseMoney } = require('../lib/bookItPrice');

const SECTIONS_OP = /\/api\/v3\/StaysPdpSections\//;

// Widget phrases that mean "this stay can't be booked", for the text fallback.
const NOT_AVAILABLE_PHRASES = [
  'those dates are not available',
  'dates not available',
  'minimum stay',
  'maximum stay',
  'unavailable',
];

async function extractPrice(page, sample) {
  if (process.env.SCRAPER_STUB === '1') return stubPrice(sample);

  const listingUrl = currentListingUrl(page);
  if (!listingUrl) throw new Error('extractPrice: page has no listing URL');
  const currency = process.env.CURRENCY || 'EUR';

  // Collect the sections answers the page receives during this navigation,
  // keeping only those whose request asked for exactly our dates. The
  // breakdown's night count already guards against a different length; this
  // guards against the same length on different dates, which the numbers alone
  // could never reveal.
  const answers = [];
  const wanted = [`"checkIn":"${sample.start}"`, `"checkOut":"${sample.end}"`];
  const onResponse = async (res) => {
    if (!SECTIONS_OP.test(res.url())) return;
    const req = res.request();
    const asked = `${req.postData() || ''}${decodeURIComponent(req.url())}`.replace(/\s+/g, '');
    if (!wanted.every((w) => asked.includes(w))) return;
    try {
      answers.push(await res.json());
    } catch {
      // unreadable body; the text fallback will cover it
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(buildBookingUrl(listingUrl, sample), { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Wait for a sections answer carrying a booking section, up to 20s.
    let section = null;
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      section = answers.map(findBookIt).filter(Boolean).pop() || null;
      if (section) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    if (section) {
      const r = readBookItPrice(section, sample.nights);
      if (r.ok) {
        return { ok: true, totalPrice: r.total, nights: sample.nights, currency, rate: r.rate };
      }
      if (r.reason === 'unavailable') {
        logger.info(`extractPrice: ${sample.start}..${sample.end} not bookable (${r.message || 'no reason given'})`);
        return { ok: false, reason: 'unavailable', message: r.message };
      }
      if (r.reason === 'dates-changed') {
        logger.warn(`extractPrice: asked for ${sample.nights} nights from ${sample.start}, Airbnb priced ${r.nights}`);
        return { ok: false, reason: 'dates-changed', message: `priced ${r.nights} nights` };
      }
      // 'no-price': fall through to the widget text.
    } else {
      logger.warn(`extractPrice: no booking data for ${sample.start}..${sample.end}, reading the widget instead`);
    }

    await page
      .waitForSelector('[data-section-id="BOOK_IT_SIDEBAR"], [data-testid="book-it-section"], [data-section-id="BOOK_IT_MOBILE"]', {
        timeout: 10_000,
      })
      .catch(() => {});
    await randomDelay(800, 1400);
    return readFromWidget(await readWidgetText(page), sample, currency);
  } finally {
    page.off('response', onResponse);
  }
}

/** The text fallback. Scoped to the booking widget, never the whole page, and
    the refundable line wins over the headline when both are present. */
function readFromWidget(text, sample, currency) {
  if (!text) return { ok: false, reason: 'no-price' };
  const lower = text.toLowerCase();
  if (!/[€$£]\s*\d/.test(text) && NOT_AVAILABLE_PHRASES.some((p) => lower.includes(p))) {
    return { ok: false, reason: 'unavailable', message: text.split('\n').find((l) => NOT_AVAILABLE_PHRASES.some((p) => l.toLowerCase().includes(p))) };
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const refundable = lines.find((l) => /^refundable\b/i.test(l) && /total/i.test(l));
  if (refundable) {
    const total = parseMoney(refundable.replace(/^refundable\s*·?\s*/i, ''));
    if (total) return { ok: true, totalPrice: total, nights: sample.nights, currency, rate: 'refundable-text' };
  }

  // One rate: the headline "€X total" (rounded to the euro, the best the
  // text offers).
  const headline = lines.find((l) => /^[€$£]\s*[\d.,]+\s+total$/i.test(l));
  const total = parseMoney(headline);
  if (total) return { ok: true, totalPrice: total, nights: sample.nights, currency, rate: 'single-text' };
  return { ok: false, reason: 'no-price' };
}

async function readWidgetText(page) {
  return page.evaluate(() => {
    const sels = ['[data-section-id="BOOK_IT_SIDEBAR"]', '[data-testid="book-it-section"]', '[data-section-id="BOOK_IT_MOBILE"]'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el.innerText || '';
    }
    return '';
  });
}

function currentListingUrl(page) {
  const u = page.url();
  if (!u || u === 'about:blank') return null;
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
  const base = 75 + (parseInt(sample.start.replace(/-/g, ''), 10) % 40);
  const totalPrice = Math.round(base * seasonality[month - 1] * sample.nights * 100) / 100;
  return { ok: true, totalPrice, nights: sample.nights, currency: process.env.CURRENCY || 'EUR', rate: 'stub' };
}

module.exports = { extractPrice, readFromWidget };
