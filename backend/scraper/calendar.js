function buildMonthUrl(listingUrl, year, month) {
  const u = new URL(listingUrl);
  u.searchParams.set('check_in', `${year}-${String(month).padStart(2, '0')}-01`);
  u.searchParams.set('check_out', `${year}-${String(month).padStart(2, '0')}-02`);
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

module.exports = { buildMonthUrl, navigateToMonth };
