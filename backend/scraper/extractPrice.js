async function extractPrice(page, gap) {
  if (process.env.SCRAPER_STUB === '1') {
    const month = parseInt(gap.start.split('-')[1], 10);
    const seasonality = [0.85, 0.85, 0.95, 1.05, 1.15, 1.25, 1.4, 1.45, 1.2, 1.05, 0.95, 1.1];
    const base = 75 + ((parseInt(gap.start.replace(/-/g, ''), 10) % 40));
    const totalPrice = Math.round(base * seasonality[month - 1] * gap.nights * 100) / 100;
    return { totalPrice, currency: process.env.CURRENCY || 'EUR', nights: gap.nights };
  }

  throw new Error(
    'IMPLEMENT_AFTER_METHODOLOGY: extractPrice() needs the price-extraction selectors from the methodology guide. ' +
      'Set SCRAPER_STUB=1 to run the pipeline with synthetic data.'
  );
}

module.exports = { extractPrice };
