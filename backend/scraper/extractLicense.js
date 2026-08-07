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

  // Try the collapsed description first — the AL number is usually visible
  // even before expanding.
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

  // Expand the full description modal and retry.
  if (!alNumber) {
    try {
      const showMore = page
        .locator('[data-section-id="DESCRIPTION_DEFAULT"] button, button')
        .filter({ hasText: /show more|mostrar mais/i })
        .first();
      if (await showMore.count()) {
        await showMore.click({ timeout: 5000 });
        await randomDelay(1000, 1800, signal);
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
