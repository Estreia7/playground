// Which stays to price in a month, decided from Airbnb's own calendar data.
//
// The calendar (see scraper/availability.js) gives every day four facts that
// the old DOM scan had to guess at, and usually guessed wrong:
//
//   available              the night can be slept in
//   availableForCheckin    a stay may start on this day
//   availableForCheckout   a stay may end on this day
//   minNights / maxNights  the length rules for a stay starting on this day
//
// A stay is only worth asking Airbnb to price if it obeys all of them. Asking
// for one that does not is what produced most of the old "dates unavailable"
// attempts: a 7-night window over a check-in-only-on-Saturday rule, or a
// 3-night window against a 5-night minimum.
//
// Pure functions only: no browser, no network. Everything here is tested in
// test/scraper-stays.test.ts.

/** Lengths to try, most representative first. A week captures both weekday
    and weekend rates in one number, which is what a monthly nightly average
    wants; shorter stays are the fallback when a gap is narrow. */
const PREFERRED_NIGHTS = [7, 5, 4, 3, 2];

/** Flatten Airbnb's calendarMonths into one list of plain day objects. */
function normaliseCalendar(calendarMonths) {
  const days = [];
  for (const m of calendarMonths || []) {
    for (const d of m.days || []) {
      if (!d || !d.calendarDate) continue;
      days.push({
        date: d.calendarDate,
        available: d.available === true,
        checkin: d.availableForCheckin === true,
        checkout: d.availableForCheckout === true,
        // Airbnb uses 1 as the floor and 1125 as "no limit".
        minNights: Number.isFinite(d.minNights) && d.minNights > 0 ? d.minNights : 1,
        maxNights: Number.isFinite(d.maxNights) && d.maxNights > 0 ? d.maxNights : 1125,
      });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function indexByDate(days) {
  const map = new Map();
  for (const d of days) map.set(d.date, d);
  return map;
}

/** Nights in the month that a guest could sleep in. */
function availableNightsIn(days, monthKey) {
  let n = 0;
  for (const d of days) if (d.date.startsWith(monthKey) && d.available) n++;
  return n;
}

/** Can a stay of `nights` nights begin on `start`? Every night must be free,
    the first day must allow check-in, the day after the last night must allow
    check-out, and the length must sit inside the start day's rules. A checkout
    day beyond the end of the calendar is unknown, so the stay is refused
    rather than guessed. */
function isValidStay(byDate, start, nights) {
  const first = byDate.get(start);
  if (!first || !first.available || !first.checkin) return false;
  if (nights < first.minNights || nights > first.maxNights) return false;
  for (let i = 0; i < nights; i++) {
    const d = byDate.get(addDays(start, i));
    if (!d || !d.available) return false;
  }
  const out = byDate.get(addDays(start, nights));
  return !!out && out.checkout;
}

/** The best length for a stay starting on `start`, or 0 if none works.
    Preferred lengths first; if the minimum stay is longer than all of them
    (a 10-night minimum, say), the minimum itself is tried. */
function bestLength(byDate, start) {
  const first = byDate.get(start);
  if (!first) return 0;
  const lengths = PREFERRED_NIGHTS.filter((n) => n >= first.minNights);
  if (first.minNights > PREFERRED_NIGHTS[0]) lengths.push(first.minNights);
  for (const n of lengths) if (isValidStay(byDate, start, n)) return n;
  return 0;
}

/** Stays to price for one month, in the order they should be tried.

    Up to `max` stays are chosen, spread across the month: the month is cut
    into `max` equal parts and each part contributes the valid start closest to
    its beginning. A month is not uniform — early October is still summer on the
    Algarve and late October is not — so three stays from one week would
    overweight it. Any remaining valid starts follow as spares, so the caller
    has somewhere to go when Airbnb refuses a price for one of the first picks.

    Stays may run over the end of the month (a 7-night stay from the 28th); it
    is still a price for a stay that starts in this month. */
function pickStays(days, monthKey, { max = 3, spares = 4 } = {}) {
  const byDate = indexByDate(days);
  const starts = days.filter((d) => d.date.startsWith(monthKey) && d.available && d.checkin);

  const candidates = [];
  for (const d of starts) {
    const nights = bestLength(byDate, d.date);
    if (nights > 0) candidates.push({ start: d.date, end: addDays(d.date, nights), nights });
  }
  if (candidates.length === 0) return [];

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayOf = (iso) => Number(iso.slice(8, 10));

  // Two stays starting a day apart are mostly the same nights priced twice,
  // which would count one week double in the month's average.
  const MIN_APART = 4;
  const clear = (c, picked) => picked.every((k) => Math.abs(dayOf(k.start) - dayOf(c.start)) >= MIN_APART);

  const chosen = [];
  const taken = new Set();
  for (let part = 0; part < max; part++) {
    const from = Math.floor((part * daysInMonth) / max) + 1;
    const to = Math.floor(((part + 1) * daysInMonth) / max);
    const pick = candidates.find(
      (c) => !taken.has(c.start) && dayOf(c.start) >= from && dayOf(c.start) <= to && clear(c, chosen)
    );
    if (pick) {
      chosen.push(pick);
      taken.add(pick.start);
    }
  }

  // A month with availability in only one part still deserves `max` prices;
  // fill from what is left, keeping them apart so they are not the same week.
  for (const c of candidates) {
    if (chosen.length >= max) break;
    if (taken.has(c.start) || !clear(c, chosen)) continue;
    chosen.push(c);
    taken.add(c.start);
  }

  const extra = candidates.filter((c) => !taken.has(c.start)).slice(0, spares);
  return [...chosen.sort((a, b) => (a.start < b.start ? -1 : 1)), ...extra];
}

module.exports = {
  PREFERRED_NIGHTS,
  normaliseCalendar,
  availableNightsIn,
  isValidStay,
  pickStays,
  addDays,
};
