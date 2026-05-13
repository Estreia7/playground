// Navigation helpers for the Airbnb listing page.
//
// Two operations:
//   - buildMonthUrl: a listing URL that lands you with the calendar focused
//     on a given month (we set check_in=YYYY-MM-01 which Airbnb interprets
//     as "show this month").
//   - openCalendar: click the check-in input on the loaded listing page so
//     the [data-testid^="calendar-day-"] cells appear in the DOM.

function buildMonthUrl(listingUrl, year, month) {
  const u = new URL(listingUrl);
  u.searchParams.set('check_in', `${year}-${String(month).padStart(2, '0')}-01`);
  u.searchParams.set('adults', '2');
  const cur = process.env.CURRENCY;
  if (cur) u.searchParams.set('currency', cur);
  return u.toString();
}

async function navigateToMonth(page, listingUrl, year, month, signal) {
  if (signal?.aborted) throw new Error('Aborted');
  if (process.env.SCRAPER_STUB === '1') return;
  await page.goto(buildMonthUrl(listingUrl, year, month), {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
}

// Try to make the calendar grid visible. We click the check-in input (its
// exact DOM differs between A/B test buckets). If a calendar-day cell is
// already in the DOM after navigation (some listings render it inline), we
// short-circuit.
async function openCalendar(page) {
  if (process.env.SCRAPER_STUB === '1') return true;

  const alreadyOpen = await page
    .locator('[data-testid^="calendar-day-"]')
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
  if (alreadyOpen) return true;

  const clickCandidates = [
    '[data-testid="change-dates-checkIn"]',
    '[data-testid="change-dates-checkin"]',
    'input[name="checkin"]',
    'input[placeholder*="Check"]',
    'button[aria-label*="Check-in" i]',
    '[data-testid="book-it-section"] input',
  ];

  for (const sel of clickCandidates) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
        await loc.click({ timeout: 2000 }).catch(() => {});
        const visible = await page
          .locator('[data-testid^="calendar-day-"]')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        if (visible) return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

module.exports = { buildMonthUrl, navigateToMonth, openCalendar };
