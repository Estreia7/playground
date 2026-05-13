// Scans the open Airbnb calendar widget and returns the open gaps for ONE month.
// The page must already be on the listing URL with the calendar visible (see
// listingWorker.openCalendar). The shape returned is:
//   [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', nights: number }, ...]
// where `end` is the checkout date (one day after the last open night) and
// nights = number of bookable nights in the gap.

const logger = require('../lib/logger');

async function extractGaps(page, monthDate) {
  if (process.env.SCRAPER_STUB === '1') {
    return stubGaps(monthDate);
  }

  // The methodology guide's calendar scan, lightly extended to capture the
  // year that Airbnb renders in the month-grid header.
  const raw = await page.evaluate(() => {
    const days = Array.from(document.querySelectorAll('[data-testid^="calendar-day-"]'));
    return days.map((d) => {
      const testid = d.getAttribute('data-testid') || '';
      const date = testid.replace('calendar-day-', '');
      const btn = d.querySelector('button') || d;
      const style = window.getComputedStyle(btn);
      const ariaDisabled = btn.getAttribute && btn.getAttribute('aria-disabled');
      const blocked =
        style.textDecoration.includes('line-through') ||
        ariaDisabled === 'true' ||
        btn.hasAttribute?.('disabled');
      return { date, blocked };
    });
  });

  if (!Array.isArray(raw) || raw.length === 0) {
    logger.warn(`extractGaps: no calendar-day elements found for ${monthDate.key}`);
    return [];
  }

  // Filter to the target month — Airbnb often renders two months at a time
  // in the popover and we only want the requested one. `data-testid` values
  // we've seen include `YYYY-MM-DD` (with year) and `MM/DD/YYYY`; handle both.
  const wantYM = `${monthDate.year}-${String(monthDate.month).padStart(2, '0')}`;
  const inMonth = raw
    .map((d) => ({ ...d, iso: normaliseDate(d.date, monthDate) }))
    .filter((d) => d.iso && d.iso.startsWith(wantYM));

  if (inMonth.length === 0) {
    logger.warn(
      `extractGaps: no days matched ${wantYM} (saw ${raw.length} cells, sample: ${raw
        .slice(0, 3)
        .map((d) => d.date)
        .join(', ')})`
    );
    return [];
  }

  inMonth.sort((a, b) => (a.iso < b.iso ? -1 : 1));

  const gaps = [];
  let runStart = null;
  let lastOpenISO = null;
  for (const day of inMonth) {
    if (!day.blocked) {
      if (!runStart) runStart = day.iso;
      lastOpenISO = day.iso;
    } else if (runStart) {
      gaps.push(buildGap(runStart, lastOpenISO));
      runStart = null;
      lastOpenISO = null;
    }
  }
  if (runStart) gaps.push(buildGap(runStart, lastOpenISO));

  return gaps.filter((g) => g.nights >= 1);
}

function normaliseDate(raw, monthDate) {
  if (!raw) return null;
  // Already ISO?
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return raw;
  // MM/DD/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, da, yr] = m;
    return `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }
  // MM/DD with implied year — assume the month we navigated to.
  m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const [, mo, da] = m;
    const moNum = parseInt(mo, 10);
    // If month rolled over from December (e.g. testid is 01/05 but we're
    // looking at January), trust the testid month — the year follows.
    let year = monthDate.year;
    if (moNum < monthDate.month && monthDate.month - moNum >= 6) year += 1;
    if (moNum > monthDate.month && moNum - monthDate.month >= 6) year -= 1;
    return `${year}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }
  return null;
}

function buildGap(firstOpenISO, lastOpenISO) {
  const nights = daysBetween(firstOpenISO, lastOpenISO) + 1;
  return { start: firstOpenISO, end: addDays(lastOpenISO, 1), nights };
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / 86_400_000);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function stubGaps(monthDate) {
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

module.exports = { extractGaps };
