// Availability for a whole year, from Airbnb's own calendar data.
//
// A listing page asks Airbnb's API for its calendar (PdpAvailabilityCalendar)
// as it loads. The answer covers twelve months and says, for every day, whether
// it is free, whether a stay may start or end on it, and the minimum and
// maximum nights. That is everything the old approach tried to read off the
// rendered calendar, and could not do reliably: the inline calendar only shows
// the current and next month, and on the server it often did not render at
// all. On the last live job, 100 of 168 listing-months came back "no
// availability" for exactly those reasons, including listings with open dates.
//
// How it works:
//   1. startCalendarCapture(page) is called before the listing page loads. It
//      remembers the calendar request the page makes on its own.
//   2. loadAvailability() then replays that request from inside the page,
//      asking for the twelve months the job wants. The page's own request
//      starts at the current month, and the job starts at the next one, so
//      replaying is how the twelfth month is covered.
//   3. If the replay fails, the page's own answer is used for the months it
//      covers. If there was no request at all, the caller falls back to the
//      old calendar scan.
//
// The replay runs inside the page with the page's own cookies and headers, so
// to Airbnb it is the same request its site just made, for a different month.

const logger = require('../lib/logger');
const { normaliseCalendar } = require('../lib/stayWindows');

const CALENDAR_OP = /\/api\/v3\/PdpAvailabilityCalendar\//;

/** Start listening for the calendar request and its answer. */
function startCalendarCapture(page) {
  const state = { request: null, response: null };

  const onRequest = (req) => {
    if (!state.request && CALENDAR_OP.test(req.url())) state.request = req;
  };
  const onResponse = async (res) => {
    if (state.response || !CALENDAR_OP.test(res.url())) return;
    try {
      state.response = await res.json();
    } catch {
      // A body we cannot parse is as good as none; the replay still works.
    }
  };

  if (process.env.SCRAPER_STUB !== '1') {
    page.on('request', onRequest);
    page.on('response', onResponse);
  }

  return {
    state,
    /** Wait up to `timeoutMs` for the page to have asked for its calendar. */
    async waitForRequest(timeoutMs = 15_000) {
      const until = Date.now() + timeoutMs;
      while (!state.request && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
      return state.request;
    },
    stop() {
      page.off?.('request', onRequest);
      page.off?.('response', onResponse);
    },
  };
}

/** Ask for twelve months starting at `first`, reusing the page's own request. */
async function replayCalendar(page, request, first, count) {
  const url = new URL(request.url());
  const vars = JSON.parse(url.searchParams.get('variables') || '{}');
  if (!vars.request) throw new Error('calendar request has no variables.request');
  vars.request.month = first.month;
  vars.request.year = first.year;
  vars.request.count = count;
  url.searchParams.set('variables', JSON.stringify(vars));

  // Only the headers the site sends for its API; the browser adds the rest.
  const headers = Object.fromEntries(
    Object.entries(request.headers()).filter(([k]) => /^(x-airbnb-|x-csrf|content-type$|accept$)/i.test(k))
  );

  const result = await page.evaluate(
    async ({ href, headers }) => {
      const res = await fetch(href, { headers, credentials: 'include' });
      if (!res.ok) return { status: res.status, body: null };
      return { status: res.status, body: await res.json() };
    },
    { href: url.toString(), headers }
  );
  if (!result.body) throw new Error(`calendar replay answered HTTP ${result.status}`);
  return result.body;
}

function calendarMonthsOf(response) {
  const months = response?.data?.merlin?.pdpAvailabilityCalendar?.calendarMonths;
  return Array.isArray(months) ? months : null;
}

/**
 * @param months  the job's months, [{ year, month, key }], first one first
 * @returns { days, source, covered } or null when no calendar data was seen
 *   days     normalised days (see lib/stayWindows.normaliseCalendar)
 *   source   'replay' | 'page' — which answer was used
 *   covered  the month keys the data actually covers
 */
async function loadAvailability(page, capture, months, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubAvailability(months);
  if (signal?.aborted) throw new Error('Aborted');

  const request = await capture.waitForRequest();
  if (!request) {
    logger.warn('availability: the listing page never asked for its calendar');
    return null;
  }

  let calendarMonths = null;
  let source = null;
  // One month more than the job needs: a stay starting late in the last month
  // checks out in the next one, and without that month's days the checkout
  // rule cannot be checked, so the stay would be refused. If Airbnb will not
  // go past twelve, twelve is still far better than the page's own answer.
  for (const count of [months.length + 1, months.length]) {
    try {
      calendarMonths = calendarMonthsOf(await replayCalendar(page, request, months[0], count));
      if (calendarMonths && calendarMonths.length > 0) {
        source = 'replay';
        break;
      }
    } catch (err) {
      logger.warn(`availability: replay of ${count} months failed (${err.message})`);
    }
  }

  if (!calendarMonths) {
    // The page's own answer arrives a moment after its request.
    const until = Date.now() + 8_000;
    while (!capture.state.response && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    calendarMonths = calendarMonthsOf(capture.state.response);
    source = 'page';
  }
  if (!calendarMonths) return null;

  const covered = calendarMonths.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`);
  return { days: normaliseCalendar(calendarMonths), source, covered };
}

/** A believable calendar for stub mode: mostly open, with a few bookings. */
function stubAvailability(months) {
  const calendarMonths = [];
  // One month past the end so the last month's stays have a checkout day.
  const last = months[months.length - 1];
  const extra = last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 };
  for (const m of [...months, extra]) {
    const n = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
    const days = [];
    for (let d = 1; d <= n; d++) {
      const booked = (d + m.month * 3) % 9 < 3;
      days.push({
        calendarDate: `${m.year}-${String(m.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        available: !booked,
        availableForCheckin: !booked,
        availableForCheckout: true,
        minNights: 2,
        maxNights: 60,
      });
    }
    calendarMonths.push({ year: m.year, month: m.month, days });
  }
  return {
    days: normaliseCalendar(calendarMonths),
    source: 'stub',
    covered: months.map((m) => m.key),
  };
}

module.exports = { startCalendarCapture, loadAvailability };
