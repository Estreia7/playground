// Process one listing across 12 calendar months, emitting progress events
// as it goes. Per-month flow:
//   1. Navigate to the listing with the calendar focused on the month.
//   2. Click the check-in input so the calendar grid is in the DOM.
//   3. extractGaps -> identify open gap runs in that month.
//   4. pickSampleGaps -> up to 3 windows, longest-gap-first.
//   5. For each sample: extractPrice navigates to a booking URL with
//      check_in/check_out and reads what the guest actually pays.
//   6. monthly ADR = average of (totalPaid / nights) across successful samples.

const { launchContext } = require('../scraper/browser');
const { navigateToMonth, openCalendar } = require('../scraper/calendar');
const { extractGaps } = require('../scraper/extractGaps');
const { extractPrice } = require('../scraper/extractPrice');
const { pickSampleGaps } = require('../scraper/pickSampleGaps');
const { nextTwelveMonths } = require('../lib/months');
const { randomDelay } = require('../lib/delay');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const PER_LISTING_TIMEOUT_MS = 15 * 60 * 1000;

async function processListing({ jobId, url, workerId, signal }) {
  const ttlDays = parseInt(process.env.CACHE_TTL_DAYS || '7', 10);
  const cached = store.cacheLookup(url, ttlDays);
  if (cached) {
    emit(jobId, 'listing-done', { jobId, url, status: 'cached', months: cached.result });
    store.saveListingResult({ jobId, url, status: 'cached', result: cached.result });
    return;
  }

  emit(jobId, 'listing-started', { jobId, url });

  const months = nextTwelveMonths();
  const results = [];
  const deadline = Date.now() + PER_LISTING_TIMEOUT_MS;

  let session = null;
  try {
    session = await launchContext(workerId);
    const page = await session.context.newPage();

    for (const m of months) {
      if (signal?.aborted) throw new Error('Aborted');
      if (Date.now() > deadline) throw new Error('Per-listing timeout exceeded');

      emit(jobId, 'progress', { jobId, url, month: m.key, status: 'fetching' });

      try {
        await navigateToMonth(page, url, m.year, m.month, signal);
        await randomDelay(3000, 6000, signal);
        await openCalendar(page);
        await randomDelay(800, 1600, signal);

        const gaps = await extractGaps(page, m);
        const samples = pickSampleGaps(gaps, 3);

        let adr = null;
        let notes = '';
        let successfulSamples = 0;

        if (samples.length === 0) {
          notes = gaps.length === 0 ? 'no-availability' : 'no-usable-gaps';
        } else {
          const rates = [];
          for (const g of samples) {
            if (signal?.aborted) throw new Error('Aborted');

            // Try the picked window first; if dates aren't available
            // (typically a minimum-stay rule), shrink by 1 night once.
            let started = Date.now();
            let price = await extractPrice(page, g);
            recordAttempt({
              jobId, url, month: m.key, sample: g,
              outcome: price?.totalPrice > 0 ? 'success' : 'dates-unavailable',
              totalPrice: price?.totalPrice,
              durationMs: Date.now() - started,
            });

            if (!price && g.nights > 2) {
              const shrunk = { ...g, nights: g.nights - 1, end: addDaysToISO(g.start, g.nights - 1) };
              await randomDelay(3000, 6000, signal);
              started = Date.now();
              price = await extractPrice(page, shrunk);
              recordAttempt({
                jobId, url, month: m.key, sample: shrunk,
                outcome: price?.totalPrice > 0 ? 'success-shrunk' : 'no-price-found',
                totalPrice: price?.totalPrice,
                durationMs: Date.now() - started,
              });
            }
            if (price?.totalPrice > 0 && price.nights > 0) {
              rates.push(price.totalPrice / price.nights);
              successfulSamples += 1;
            }
            await randomDelay(3000, 6000, signal);
          }
          if (rates.length > 0) {
            adr = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
          } else {
            notes = 'no-price-found';
          }
        }

        const monthResult = { month: m.key, adr, samples: successfulSamples, notes };
        results.push(monthResult);
        emit(jobId, 'progress', { jobId, url, month: m.key, status: 'done', adr });
      } catch (err) {
        if (signal?.aborted) throw err;
        logger.warn(`month ${m.key} failed for ${url}:`, err.message);
        results.push({ month: m.key, adr: null, samples: 0, notes: `error: ${err.message}` });
        emit(jobId, 'progress', { jobId, url, month: m.key, status: 'error', error: err.message });
      }
    }

    await page.close().catch(() => {});

    const finalStatus = signal?.aborted ? 'cancelled' : 'done';
    emit(jobId, 'listing-done', { jobId, url, status: finalStatus, months: results });
    store.saveListingResult({ jobId, url, status: finalStatus, result: results });
    if (finalStatus === 'done') store.cacheUpsert(url, results);
  } catch (err) {
    const status = signal?.aborted ? 'cancelled' : 'error';
    const monthsCompleted = results.length;
    const padded = results.concat(
      months
        .slice(monthsCompleted)
        .map((m) => ({ month: m.key, adr: null, samples: 0, notes: status }))
    );
    emit(jobId, 'listing-done', { jobId, url, status, months: padded, error: err.message });
    store.saveListingResult({ jobId, url, status, result: padded });
  } finally {
    if (session) await session.close().catch(() => {});
  }
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
