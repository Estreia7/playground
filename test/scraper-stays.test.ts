import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/* The scraper's two decisions, tested without a browser: which stays to ask
   Airbnb to price, and which price to keep from its answer.

   The backend is CommonJS, so it is loaded with require. The booking fixtures
   are real BOOK_IT_SIDEBAR sections captured from a live listing on
   2026-09-30: blocked dates, a stay below the 2-night minimum, a single rate,
   and a listing offering both a non-refundable and a refundable rate. */

const require = createRequire(import.meta.url);
const stays = require("../backend/lib/stayWindows.js");
const price = require("../backend/lib/bookItPrice.js");

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/airbnb-bookit-${name}.json`, import.meta.url), "utf8")).section;

/* ── a synthetic calendar ─────────────────────────────────────── */

type DayOpts = { available?: boolean; checkin?: boolean; checkout?: boolean; min?: number; max?: number };

/** A calendar for Oct 2026 – Nov 2026 where every day is open unless `rules`
    says otherwise for that date. */
function calendar(rules: Record<string, DayOpts> = {}) {
  const months = [];
  for (const month of [10, 11]) {
    const days = [];
    const n = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    for (let d = 1; d <= n; d++) {
      const date = `2026-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const r = rules[date] ?? {};
      days.push({
        calendarDate: date,
        available: r.available ?? true,
        availableForCheckin: r.checkin ?? r.available ?? true,
        availableForCheckout: r.checkout ?? true,
        minNights: r.min ?? 1,
        maxNights: r.max ?? 1125,
      });
    }
    months.push({ year: 2026, month, days });
  }
  return stays.normaliseCalendar(months);
}

/** Block a run of nights: they cannot be slept in or started on. */
function blocked(from: string, count: number): Record<string, DayOpts> {
  const out: Record<string, DayOpts> = {};
  for (let i = 0; i < count; i++) out[stays.addDays(from, i)] = { available: false, checkin: false };
  return out;
}

test("the calendar is flattened in date order with sane defaults", () => {
  const days = stays.normaliseCalendar([
    { year: 2026, month: 11, days: [{ calendarDate: "2026-11-01", available: true, minNights: 0, maxNights: null }] },
    { year: 2026, month: 10, days: [{ calendarDate: "2026-10-31", available: false }] },
  ]);
  assert.deepEqual(days.map((d: { date: string }) => d.date), ["2026-10-31", "2026-11-01"]);
  assert.equal(days[1].minNights, 1, "a zero minimum is read as one night");
  assert.equal(days[1].maxNights, 1125, "a missing maximum means no limit");
});

test("available nights are counted per month, and only in that month", () => {
  const days = calendar(blocked("2026-10-01", 3));
  assert.equal(stays.availableNightsIn(days, "2026-10"), 28);
  assert.equal(stays.availableNightsIn(days, "2026-11"), 30);
});

test("a fully booked month offers no stays", () => {
  const days = calendar(blocked("2026-10-01", 31));
  assert.equal(stays.availableNightsIn(days, "2026-10"), 0);
  assert.deepEqual(stays.pickStays(days, "2026-10"), []);
});

test("an open month gets three week-long stays, spread across it", () => {
  const picks = stays.pickStays(calendar(), "2026-10", { max: 3, spares: 0 });
  assert.equal(picks.length, 3);
  assert.ok(picks.every((p: { nights: number }) => p.nights === 7), "a week is the preferred length");
  const startDays = picks.map((p: { start: string }) => Number(p.start.slice(8)));
  assert.deepEqual(startDays, [1, 11, 21], "one from each third of the month");
});

test("every stay obeys the minimum stay of the day it starts on", () => {
  // A 10-night minimum everywhere: none of the preferred lengths qualify, so
  // the minimum itself is used.
  const rules: Record<string, DayOpts> = {};
  for (let d = 1; d <= 31; d++) rules[`2026-10-${String(d).padStart(2, "0")}`] = { min: 10 };
  const picks = stays.pickStays(calendar(rules), "2026-10", { spares: 0 });
  assert.ok(picks.length > 0);
  assert.ok(picks.every((p: { nights: number }) => p.nights === 10), "nothing shorter than the minimum is asked for");
});

test("stays only start on days that allow check-in", () => {
  // Check-in on Saturdays only (Oct 2026: 3, 10, 17, 24, 31).
  const rules: Record<string, DayOpts> = {};
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, "0")}`;
    rules[date] = { checkin: new Date(date + "T00:00:00Z").getUTCDay() === 6 };
  }
  const picks = stays.pickStays(calendar(rules), "2026-10", { spares: 0 });
  assert.ok(picks.length > 0);
  for (const p of picks) {
    assert.equal(new Date(p.start + "T00:00:00Z").getUTCDay(), 6, `${p.start} is not a Saturday`);
  }
});

test("a stay is refused when its checkout day does not allow checkout", () => {
  const days = calendar({ "2026-10-08": { checkout: false } });
  const byDate = new Map(days.map((d: { date: string }) => [d.date, d]));
  assert.equal(stays.isValidStay(byDate, "2026-10-01", 7), false, "checkout on the 8th is not allowed");
  assert.equal(stays.isValidStay(byDate, "2026-10-01", 6), true);
});

test("a stay never crosses a booked night", () => {
  // Booked 10th–12th: nothing starting before the 10th may run into it.
  const days = calendar(blocked("2026-10-10", 3));
  for (const p of stays.pickStays(days, "2026-10", { spares: 20 })) {
    for (let i = 0; i < p.nights; i++) {
      const night = stays.addDays(p.start, i);
      assert.ok(!["2026-10-10", "2026-10-11", "2026-10-12"].includes(night), `${p.start} for ${p.nights} crosses ${night}`);
    }
  }
});

test("a narrow gap gets a shorter stay rather than none", () => {
  // Only the 14th–16th are free (3 nights), with checkout allowed on the 17th.
  const days = calendar({ ...blocked("2026-10-01", 13), ...blocked("2026-10-17", 15) });
  const picks = stays.pickStays(days, "2026-10", { spares: 0 });
  assert.equal(picks.length, 1);
  assert.deepEqual(picks[0], { start: "2026-10-14", end: "2026-10-17", nights: 3 });
});

test("a stay whose checkout falls beyond the calendar is not guessed at", () => {
  // The synthetic calendar ends on 30 November.
  const days = calendar();
  const byDate = new Map(days.map((d: { date: string }) => [d.date, d]));
  assert.equal(stays.isValidStay(byDate, "2026-11-28", 7), false);
});

test("the chosen stays start at least four days apart, even across a part boundary", () => {
  // Free only from the 10th: the first third's latest start (the 10th) and the
  // second third's earliest (the 11th) would otherwise both be picked — the
  // same week priced twice. Seen live on a July calendar.
  const days = calendar(blocked("2026-10-01", 9));
  const picks = stays.pickStays(days, "2026-10", { max: 3, spares: 0 });
  const starts = picks.map((p: { start: string }) => Number(p.start.slice(8))).sort((a: number, b: number) => a - b);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] - starts[i - 1] >= 4, `starts ${starts.join(", ")} are too close`);
  }
  assert.equal(picks.length, 3, "and the month still gets three stays");
});

test("spare stays follow the main picks and never repeat them", () => {
  const picks = stays.pickStays(calendar(), "2026-10", { max: 3, spares: 4 });
  assert.equal(picks.length, 7);
  assert.equal(new Set(picks.map((p: { start: string }) => p.start)).size, 7, "no start date twice");
});

/* ── reading the price ────────────────────────────────────────── */

test("money strings in every format Airbnb uses", () => {
  assert.equal(price.parseMoney("€555.00 total"), 555);
  assert.equal(price.parseMoney("€408.75 total"), 408.75);
  assert.equal(price.parseMoney("€1,234.56"), 1234.56);
  assert.equal(price.parseMoney("1.234,56 €"), 1234.56);
  assert.equal(price.parseMoney("€1.234"), 1234);
  assert.equal(price.parseMoney("€ 555"), 555);
  assert.equal(price.parseMoney(""), null);
  assert.equal(price.parseMoney(undefined), null);
});

test("with two rates, the refundable one is kept, not the non-refundable headline", () => {
  const r = price.readBookItPrice(fixture("tworates"), 5);
  // The widget headline reads "€409 total"; that is the non-refundable rate.
  assert.equal(r.ok, true);
  assert.equal(r.total, 425, "Refundable · €425.00 total");
  assert.equal(r.rate, "refundable");
  assert.equal(r.nights, 5);
});

test("with one rate, the exact breakdown total is kept, not the rounded headline", () => {
  const r = price.readBookItPrice(fixture("single"), 7);
  assert.equal(r.ok, true);
  assert.equal(r.total, 555);
  assert.equal(r.rate, "single");
  assert.equal(r.nights, 7);
});

test("blocked dates and a too-short stay are reported as unavailable, with Airbnb's reason", () => {
  const blockedR = price.readBookItPrice(fixture("blocked"), 2);
  assert.deepEqual(blockedR, { ok: false, reason: "unavailable", message: "Those dates are not available" });

  const shortR = price.readBookItPrice(fixture("minstay"), 1);
  assert.deepEqual(shortR, { ok: false, reason: "unavailable", message: "Minimum stay is 2 nights" });
});

test("a price for a different number of nights than asked is refused", () => {
  // The single-rate fixture is a 7-night stay; asking for 5 means Airbnb moved
  // the dates, and dividing by 5 would overstate the nightly rate.
  const r = price.readBookItPrice(fixture("single"), 5);
  assert.deepEqual(r, { ok: false, reason: "dates-changed", nights: 7 });
});

test("the refundable rate is found by title, and by price when titles are unfamiliar", () => {
  assert.deepEqual(
    price.pickRefundable([
      { title: "Non-refundable", priceString: "€90.00 total" },
      { title: "Refundable", priceString: "€100.00 total" },
    ]),
    { total: 100, title: "Refundable", how: "title" },
  );
  // "Non-refundable" contains "refundable"; it must never be mistaken for it.
  assert.equal(
    price.pickRefundable([
      { title: "Refundable", priceString: "€100.00 total" },
      { title: "Non-refundable", priceString: "€90.00 total" },
    ]).total,
    100,
  );
  // Unknown language: the dearer option is the refundable one by construction.
  assert.deepEqual(
    price.pickRefundable([
      { title: "Option A", priceString: "€90.00 total" },
      { title: "Option B", priceString: "€100.00 total" },
    ]),
    { total: 100, title: "Option B", how: "highest" },
  );
});

/* ── the text fallback, for when the booking data never arrives ── */

const widget = require("../backend/scraper/extractPrice.js");
const STAY = { start: "2026-11-10", end: "2026-11-15", nights: 5 };

test("the widget text fallback also prefers the refundable line over the headline", () => {
  // Captured from the live widget for 10–15 November.
  const text = [
    "Add a night for €62", "Extend to Nov 16 with this special offer.", "Add 1 night",
    "Your dates and price were changed", "€409 total", "Show price breakdown", "€409 total",
    "CHECK-IN", "11/10/2026", "CHECKOUT", "11/15/2026", "GUESTS", "2 guests", "RATES",
    "Non-refundable · €408.75 total",
    "Free cancellation for 24 hours. After that, the reservation is non-refundable.",
    "Refundable · €425.00 total",
    "Free cancellation before October 11.",
  ].join("\n");
  const r = widget.readFromWidget(text, STAY, "EUR");
  assert.equal(r.ok, true);
  assert.equal(r.totalPrice, 425);
  assert.equal(r.rate, "refundable-text");
});

test("the widget text fallback reads a single headline price", () => {
  const text = ["€555 total", "Show price breakdown", "€555 total", "CHECK-IN", "10/14/2026"].join("\n");
  const r = widget.readFromWidget(text, { ...STAY, nights: 7 }, "EUR");
  assert.equal(r.ok, true);
  assert.equal(r.totalPrice, 555);
});

test("the widget text fallback reports blocked dates as unavailable", () => {
  const text = ["Add dates for prices", "CHECK-IN", "10/1/2026", "Those dates are not available", "Change dates"].join("\n");
  const r = widget.readFromWidget(text, STAY, "EUR");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unavailable");
  assert.equal(r.message, "Those dates are not available");
  assert.deepEqual(widget.readFromWidget("", STAY, "EUR"), { ok: false, reason: "no-price" });
});

test("the booking section is found inside a whole page response", () => {
  const section = fixture("single");
  const response = {
    data: {
      presentation: {
        stayProductDetailPage: {
          sections: { sections: [{ sectionId: "TITLE_DEFAULT", section: {} }, { sectionId: "BOOK_IT_SIDEBAR", section }] },
        },
      },
    },
  };
  assert.equal(price.findBookIt(response), section);
  assert.equal(price.findBookIt({}), null);
  assert.deepEqual(price.readBookItPrice(null, 7), { ok: false, reason: "no-price" });
});
