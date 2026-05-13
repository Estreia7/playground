async function extractGaps(page, monthDate) {
  if (process.env.SCRAPER_STUB === '1') {
    const { year, month } = monthDate;
    const daysInMonth = new Date(year, month, 0).getDate();
    const seed = (year * 31 + month) % 7;
    const gaps = [];
    let cursor = 1 + seed;
    while (cursor + 3 <= daysInMonth) {
      const nights = 2 + ((cursor + seed) % 3);
      const start = `${year}-${String(month).padStart(2, '0')}-${String(cursor).padStart(2, '0')}`;
      const endDay = cursor + nights;
      const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      gaps.push({ start, end, nights });
      cursor = endDay + 2 + (seed % 2);
    }
    return gaps;
  }

  throw new Error(
    'IMPLEMENT_AFTER_METHODOLOGY: extractGaps() needs the JS calendar-script from the methodology guide. ' +
      'Set SCRAPER_STUB=1 to run the pipeline with synthetic data.'
  );
}

module.exports = { extractGaps };
