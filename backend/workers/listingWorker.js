// Process one listing across 12 calendar months, emitting progress events
// as it goes.
//
//   1. Load the listing once (for its metadata). While it loads, the page asks
//      Airbnb for its calendar; that request is caught and replayed for the
//      job's twelve months (scraper/availability.js). One request tells us, for
//      every day of the year, whether it is free, whether a stay can start or
//      end on it, and the minimum stay.
//   2. Per month: count the free nights. None means "no-availability", and that
//      is now a fact from Airbnb rather than a failed page read.
//   3. Pick up to three stays spread across the month that obey the calendar's
//      rules (lib/stayWindows.js), plus spares.
//   4. Price each at the refundable rate (scraper/extractPrice.js) until three
//      succeed or the attempts run out.
//   5. Monthly ADR = average of (refundable total / nights) across the stays.
//
// If the calendar data never arrives, a month falls back to the old path:
// open the rendered calendar, scan it for gaps, and price those.

const { launchContext } = require('../scraper/browser');
const { navigateToMonth, openCalendar } = require('../scraper/calendar');
const { extractGaps } = require('../scraper/extractGaps');
const { extractPrice } = require('../scraper/extractPrice');
const { extractMeta } = require('../scraper/extractMeta');
const { pickSampleGaps } = require('../scraper/pickSampleGaps');
const { startCalendarCapture, loadAvailability } = require('../scraper/availability');
const { availableNightsIn, pickStays } = require('../lib/stayWindows');
const { nextTwelveMonths } = require('../lib/months');
const { randomDelay } = require('../lib/delay');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const PER_LISTING_TIMEOUT_MS = 15 * 60 * 1000;
/** Stays priced per month, and the most attempts spent getting them. */
const STAYS_PER_MONTH = 3;
const MAX_ATTEMPTS_PER_MONTH = 5;

async function processListing({ jobId, url, workerId, signal, fresh = false }) {
  const ttlDays = parseInt(process.env.CACHE_TTL_DAYS || '7', 10);
  // A re-run asks for a fresh scrape: the cache is skipped here, and the new
  // result replaces the cached one when the listing finishes.
  const cached = fresh ? null : store.cacheLookup(url, ttlDays);
  if (cached) {
    const { meta, months } = normalizeResult(cached.result);
    emit(jobId, 'listing-done', { jobId, url, status: 'cached', meta, months });
    store.saveListingResult({ jobId, url, status: 'cached', result: { meta, months } });
    return;
  }

  emit(jobId, 'listing-started', { jobId, url });

  const months = nextTwelveMonths();
  const results = [];
  const deadline = Date.now() + PER_LISTING_TIMEOUT_MS;

  let session = null;
  let meta = { title: null, reviewsCount: null, reviewsScore: null };
  try {
    session = await launchContext(workerId);
    const page = await session.context.newPage();

    // Listing-level metadata (title, review count/score) — scraped once,
    // before the month loop. Never let a meta failure abort the ADR run.
    // The calendar request the page makes while loading is caught here too.
    const capture = startCalendarCapture(page);
    try {
      meta = await extractMeta(page, url, signal);
      emit(jobId, 'listing-meta', { jobId, url, meta });
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`meta extraction failed for ${url}:`, err.message);
    }

    let availability = null;
    try {
      availability = await loadAvailability(page, capture, months, signal);
      if (availability) {
        logger.info(`availability for ${url}: ${availability.covered.length} months via ${availability.source}`);
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`availability failed for ${url}, falling back to the calendar scan:`, err.message);
    } finally {
      capture.stop();
    }

    for (const m of months) {
      if (signal?.aborted) throw new Error('Aborted');
      if (Date.now() > deadline) throw new Error('Per-listing timeout exceeded');

      emit(jobId, 'progress', { jobId, url, month: m.key, status: 'fetching' });

      try {
        const monthResult =
          availability && availability.covered.includes(m.key)
            ? await priceMonthFromCalendar({ jobId, url, page, month: m, days: availability.days, signal })
            : await priceMonthFromPage({ jobId, url, page, month: m, signal });
        results.push(monthResult);
        emit(jobId, 'progress', { jobId, url, month: m.key, status: 'done', adr: monthResult.adr });
      } catch (err) {
        if (signal?.aborted) throw err;
        logger.warn(`month ${m.key} failed for ${url}:`, err.message);
        results.push({ month: m.key, adr: null, samples: 0, notes: `error: ${err.message}` });
        emit(jobId, 'progress', { jobId, url, month: m.key, status: 'error', error: err.message });
      }
    }

    await page.close().catch(() => {});

    const finalStatus = signal?.aborted ? 'cancelled' : 'done';
    emit(jobId, 'listing-done', { jobId, url, status: finalStatus, meta, months: results });
    store.saveListingResult({ jobId, url, status: finalStatus, result: { meta, months: results } });
    if (finalStatus === 'done') store.cacheUpsert(url, { meta, months: results });
  } catch (err) {
    const status = signal?.aborted ? 'cancelled' : 'error';
    const monthsCompleted = results.length;
    const padded = results.concat(
      months
        .slice(monthsCompleted)
        .map((m) => ({ month: m.key, adr: null, samples: 0, notes: status }))
    );
    emit(jobId, 'listing-done', { jobId, url, status, meta, months: padded, error: err.message });
    store.saveListingResult({ jobId, url, status, result: { meta, months: padded } });
  } finally {
    if (session) await session.close().catch(() => {});
  }
}

/* One month from the calendar data: free nights counted, stays chosen by the
   calendar's own rules, each priced at the refundable rate. */
async function priceMonthFromCalendar({ jobId, url, page, month, days, signal }) {
  const availableNights = availableNightsIn(days, month.key);
  if (availableNights === 0) {
    return { month: month.key, adr: null, samples: 0, notes: 'no-availability', availableNights };
  }

  const candidates = pickStays(days, month.key, { max: STAYS_PER_MONTH, spares: MAX_ATTEMPTS_PER_MONTH });
  if (candidates.length === 0) {
    // Free nights exist, but no stay can start in this month under the
    // listing's rules (check-in on Saturdays only and no free Saturday, say).
    return { month: month.key, adr: null, samples: 0, notes: 'no-usable-gaps', availableNights };
  }

  const rates = [];
  let attempts = 0;
  for (const stay of candidates) {
    if (rates.length >= STAYS_PER_MONTH || attempts >= MAX_ATTEMPTS_PER_MONTH) break;
    if (signal?.aborted) throw new Error('Aborted');
    attempts += 1;

    const started = Date.now();
    const price = await extractPrice(page, stay);
    recordAttempt({
      jobId,
      url,
      month: month.key,
      sample: stay,
      outcome: price.ok ? 'success' : price.reason === 'no-price' ? 'no-price-found' : 'dates-unavailable',
      totalPrice: price.ok ? price.totalPrice : null,
      durationMs: Date.now() - started,
    });
    if (price.ok && price.totalPrice > 0 && price.nights > 0) rates.push(price.totalPrice / price.nights);
    await randomDelay(3000, 6000, signal);
  }

  return {
    month: month.key,
    adr: rates.length > 0 ? round2(average(rates)) : null,
    samples: rates.length,
    notes: rates.length > 0 ? '' : 'no-price-found',
    availableNights,
  };
}

/* The old path, kept as the fallback for when no calendar data arrived: open
   the rendered calendar, scan it for open runs, price the longest. */
async function priceMonthFromPage({ jobId, url, page, month, signal }) {
  await navigateToMonth(page, url, month.year, month.month, signal);
  await randomDelay(3000, 6000, signal);
  await openCalendar(page);
  await randomDelay(800, 1600, signal);

  const gaps = await extractGaps(page, month);
  const samples = pickSampleGaps(gaps, STAYS_PER_MONTH);
  if (samples.length === 0) {
    return { month: month.key, adr: null, samples: 0, notes: gaps.length === 0 ? 'no-availability' : 'no-usable-gaps' };
  }

  const rates = [];
  for (const g of samples) {
    if (signal?.aborted) throw new Error('Aborted');

    // Without the calendar's rules the window may break a minimum stay, so a
    // refusal earns one retry a night shorter.
    let started = Date.now();
    let price = await extractPrice(page, g);
    recordAttempt({
      jobId,
      url,
      month: month.key,
      sample: g,
      outcome: price.ok ? 'success' : 'dates-unavailable',
      totalPrice: price.ok ? price.totalPrice : null,
      durationMs: Date.now() - started,
    });

    if (!price.ok && g.nights > 2) {
      const shrunk = { ...g, nights: g.nights - 1, end: addDaysToISO(g.start, g.nights - 1) };
      await randomDelay(3000, 6000, signal);
      started = Date.now();
      price = await extractPrice(page, shrunk);
      recordAttempt({
        jobId,
        url,
        month: month.key,
        sample: shrunk,
        outcome: price.ok ? 'success-shrunk' : 'no-price-found',
        totalPrice: price.ok ? price.totalPrice : null,
        durationMs: Date.now() - started,
      });
    }
    if (price.ok && price.totalPrice > 0 && price.nights > 0) rates.push(price.totalPrice / price.nights);
    await randomDelay(3000, 6000, signal);
  }

  return {
    month: month.key,
    adr: rates.length > 0 ? round2(average(rates)) : null,
    samples: rates.length,
    notes: rates.length > 0 ? '' : 'no-price-found',
  };
}

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Stored results may be either the legacy bare months-array (pre-meta) or the
// current { meta, months } object. Normalize to the object shape.
function normalizeResult(result) {
  const emptyMeta = { title: null, reviewsCount: null, reviewsScore: null };
  if (Array.isArray(result)) return { meta: emptyMeta, months: result };
  if (result && typeof result === 'object') {
    return {
      meta: { ...emptyMeta, ...(result.meta || {}) },
      months: Array.isArray(result.months) ? result.months : [],
    };
  }
  return { meta: emptyMeta, months: [] };
}

function addDaysToISO(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function recordAttempt({ jobId, url, month, sample, outcome, totalPrice, durationMs }) {
  try {
    store.insertScrapeAttempt({
      jobId,
      url,
      month,
      sampleStart: sample.start,
      sampleEnd: sample.end,
      sampleNights: sample.nights,
      outcome,
      totalPrice: totalPrice ?? null,
      durationMs,
    });
  } catch (err) {
    logger.warn('insertScrapeAttempt failed', err.message);
  }
}

module.exports = { processListing };
