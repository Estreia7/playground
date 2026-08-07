// Extract the AL (Alojamento Local) license number and the location line from
// a listing page the caller has ALREADY navigated to (extractMeta runs first
// on the same visit).
//
// The AL number appears as "NNNNNN/AL" — usually at the end of the listing
// description, sometimes in a dedicated "License number"/"Registration" field.
// We expand the description ("Show more" modal) when present, then regex the
// modal text, falling back to the whole body text.

const logger = require('../lib/logger');
const { randomDelay } = require('../lib/delay');

const AL_RE = /(\d{4,9})\s*\/\s*AL\b/i;

async function extractLicense(page, listingUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubLicense(listingUrl);
  if (signal?.aborted) throw new Error('Aborted');

  // The description section hydrates late — much later than the JSON-LD that
  // extractMeta reads. Wait for it explicitly (this was the cause of a full
  // 0/12 miss on the first live run: every eval fired before it existed).
  await page
    .waitForSelector(
      '[data-section-id="DESCRIPTION_DEFAULT"], [data-section-id="DESCRIPTION_MODAL"]',
      { timeout: 20_000 }
    )
    .catch(() => {});
  await randomDelay(1500, 2500, signal);

  // Location line: "Entire rental unit in Albufeira, Portugal".
  const locationText = await page
    .evaluate(() => {
      const overview = document.querySelector('[data-section-id="OVERVIEW_DEFAULT"] h2, [data-section-id="OVERVIEW_DEFAULT_V2"] h2');
      if (overview && overview.innerText.trim()) return overview.innerText.trim();
      const h2 = Array.from(document.querySelectorAll('h2')).find((h) =>
        /\b(in|em)\s+.+/i.test(h.innerText || '')
      );
      return h2 ? h2.innerText.trim() : null;
    })
    .catch(() => null);

  // Try the collapsed description first — the AL number ("Registration
  // Details" block) is usually visible even before expanding.
  let alNumber = await page
    .evaluate((reSource) => {
      const re = new RegExp(reSource, 'i');
      const section = document.querySelector(
        '[data-section-id="DESCRIPTION_DEFAULT"], [data-section-id="DESCRIPTION_MODAL"]'
      );
      const text = section ? section.innerText : '';
      const m = text.match(re);
      return m ? m[1] : null;
    }, AL_RE.source)
    .catch(() => null);

  // Expand the description's own "Show more" (strictly scoped — the page has
  // many other Show more buttons) and read the full-description modal.
  if (!alNumber) {
    try {
      const showMore = page
        .locator('[data-section-id="DESCRIPTION_DEFAULT"] button')
        .filter({ hasText: /show more|mostrar mais/i })
        .first();
      if (await showMore.count()) {
        await showMore.scrollIntoViewIfNeeded().catch(() => {});
        await showMore.click({ timeout: 6000 });
        await page.waitForSelector('[role="dialog"]', { timeout: 10_000 }).catch(() => {});
        await randomDelay(1200, 2000, signal);
        alNumber = await page
          .evaluate((reSource) => {
            const re = new RegExp(reSource, 'i');
            const modal = document.querySelector('[role="dialog"]');
            const text = modal ? modal.innerText : '';
            const m = text.match(re);
            return m ? m[1] : null;
          }, AL_RE.source)
          .catch(() => null);
        await page.keyboard.press('Escape').catch(() => {});
        await randomDelay(500, 900, signal);
      }
    } catch (err) {
      logger.warn(`description expand failed for ${listingUrl}:`, err.message);
    }
  }

  // Last resort: anywhere in the page (covers "License number: 12345/AL"
  // fields outside the description section).
  if (!alNumber) {
    alNumber = await page
      .evaluate((reSource) => {
        const re = new RegExp(reSource, 'i');
        const m = (document.body?.innerText || '').match(re);
        return m ? m[1] : null;
      }, AL_RE.source)
      .catch(() => null);
    if (!alNumber) {
      logger.warn(`no AL number found on ${listingUrl}`);
    }
  }

  return { alNumber, locationText };
}

function stubLicense(listingUrl) {
  const m = listingUrl.match(/\/rooms\/(\d+)/);
  const id = m ? m[1] : '0';
  const seed = parseInt(id.slice(-3), 10) || 0;
  // Every 5th stub listing has no license, to exercise the unlicensed flag.
  const alNumber = seed % 5 === 4 ? null : String(100000 + (seed % 90000));
  return {
    alNumber,
    locationText: `Apartment in ${['Albufeira', 'Lagos', 'Portimão', 'Loulé'][seed % 4]}`,
  };
}

module.exports = { extractLicense, AL_RE };
