const { launchContext } = require('../scraper/browser');
const { navigateToMonth } = require('../scraper/calendar');
const { extractGaps } = require('../scraper/extractGaps');
const { extractPrice } = require('../scraper/extractPrice');
const { pickSampleGaps } = require('../scraper/pickSampleGaps');
const { nextTwelveMonths } = require('../lib/months');
const { randomDelay } = require('../lib/delay');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const PER_LISTING_TIMEOUT_MS = 8 * 60 * 1000;

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
        await randomDelay(3000, 8000, signal);

        const gaps = await extractGaps(page, m);
        const samples = pickSampleGaps(gaps, 3);

        let adr = null;
        let notes = '';
        if (samples.length === 0) {
          notes = 'no-gaps';
        } else {
          const rates = [];
          for (const g of samples) {
            if (signal?.aborted) throw new Error('Aborted');
            const price = await extractPrice(page, g);
            if (price?.totalPrice > 0 && price.nights > 0) {
              rates.push(price.totalPrice / price.nights);
            }
            await randomDelay(3000, 8000, signal);
          }
          if (rates.length > 0) {
            adr = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
          } else {
            notes = 'no-prices';
          }
        }

        const monthResult = { month: m.key, adr, samples: samples.length, notes };
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
      months.slice(monthsCompleted).map((m) => ({ month: m.key, adr: null, samples: 0, notes: status }))
    );
    emit(jobId, 'listing-done', { jobId, url, status, months: padded, error: err.message });
    store.saveListingResult({ jobId, url, status, result: padded });
  } finally {
    if (session) await session.close().catch(() => {});
  }
}

module.exports = { processListing };
