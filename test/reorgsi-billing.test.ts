import { test } from "node:test";
import assert from "node:assert/strict";
import type { Consultant, Db, Listing } from "../src/app/reorgsi/core/types.ts";
import { emptyDb } from "../src/app/reorgsi/core/types.ts";
import { apply } from "../src/app/reorgsi/core/actions.ts";
import { billedIn, billedUpTo, closedUpTo, goalPace } from "../src/app/reorgsi/core/billing.ts";
import { consultantStats, teamStats } from "../src/app/reorgsi/core/analytics.ts";
import { prizeProgress } from "../src/app/reorgsi/core/prizes.ts";
import { buildReport } from "../src/app/reorgsi/core/report.ts";
import { expected, listingRowOf } from "../src/app/reorgsi/core/listings.ts";

const NOV = new Date(2026, 10, 4);
const env = { newId: () => "new", now: () => "2026-11-04" };

function person(over: Partial<Consultant> = {}): Consultant {
  return { id: "a", name: "Ana", status: "experiente", billingByYear: {}, ...over };
}
const months = (...v: number[]) => [...v, ...Array(12 - v.length).fill(0)];
const dbOf = (...consultants: Consultant[]): Db => ({ ...emptyDb(), consultants });

test("a year with months sums them; without, it falls back to the yearly total", () => {
  const c = person({ billingByYear: { "2024": 900, "2025": 100 }, billingByMonth: { "2025": months(10, 20) } });
  assert.equal(billedIn(c, "2025"), 30);
  assert.equal(billedIn(c, "2024"), 900);
  assert.equal(billedIn(c, "2023"), 0);
});

test("closed months follow the calendar, and figures entered early extend them", () => {
  assert.equal(closedUpTo("2025", NOV), 11);
  assert.equal(closedUpTo("2026", NOV), 9);
  assert.equal(closedUpTo("2027", NOV), -1);
  assert.equal(closedUpTo("2026", new Date(2026, 0, 15)), -1);
  const c = person({ billingByMonth: { "2026": months(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5) } });
  assert.equal(billedUpTo(c, "2026", NOV), 10);
});

test("the goal's monthly bar rises when a month falls short and falls when it beats it", () => {
  const plans = { "2026": { delivered: true, meetingHeld: true, billingTarget: 120000 } };
  const pace = (november: number) =>
    goalPace(person({ plans, billingByMonth: { "2026": months(...Array(10).fill(10000), november) } }), "2026", NOV)!;
  assert.equal(pace(0).perMonth, 10000);
  assert.equal(pace(0).monthsLeft, 2);
  assert.equal(pace(4000).perMonth, 16000);
  assert.equal(pace(15000).perMonth, 5000);
  assert.equal(pace(30000).reached, true);
  assert.equal(pace(30000).perMonth, 0);
});

test("no goal, no pace", () => {
  assert.equal(goalPace(person(), "2026", NOV), null);
});

test("billing and the manager's 2% come from the record, not from invoices", () => {
  const db = dbOf(person({ billingByMonth: { "2026": months(1000, 2000) } }));
  const s = consultantStats(db, db.consultants[0], "2026");
  assert.equal(s.billed, 3000);
  assert.equal(s.managerShare, 60);
  const t = teamStats(db, "2026");
  assert.equal(t.billed, 3000);
  assert.equal(t.managerShare, 60);
  assert.equal(t.shareByMonth[1], 40);
});

test("growth compares the same months of the year before", () => {
  const db = dbOf(person({ billingByMonth: { "2025": months(100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 9000, 9000), "2026": months(...Array(10).fill(150)) } }));
  const s = consultantStats(db, db.consultants[0], "2026");
  assert.equal(s.previousToDate, 1000);
  assert.ok(Math.abs(s.growth! - 0.5) < 1e-9);
});

test("prize bar: levels are equally spaced and the top one fills it", () => {
  assert.equal(prizeProgress(0).position, 0);
  assert.equal(prizeProgress(0).next?.label, "Ruby");
  const ruby = prizeProgress(55000);
  assert.equal(ruby.current?.label, "Ruby");
  assert.equal(ruby.missing, 27000);
  assert.ok(Math.abs(ruby.position - 1 / 6) < 1e-9);
  assert.ok(Math.abs(prizeProgress(68500).position - 1.5 / 6) < 1e-9);
  const top = prizeProgress(600000);
  assert.equal(top.next, null);
  assert.equal(top.position, 1);
});

test("billing.month edits one month across years and leaves the rest", () => {
  const db = dbOf(person({ billingByMonth: { "2025": months(10, 20) } }));
  const r = apply(db, { type: "billing.month", consultantId: "a", month: 1, values: { "2025": 99, "2026": 7 } }, env);
  assert.ok(r.ok);
  const c = r.db.consultants[0];
  assert.deepEqual(c.billingByMonth!["2025"].slice(0, 3), [10, 99, 0]);
  assert.equal(c.billingByMonth!["2026"][1], 7);
  assert.equal(c.billingByMonth!["2026"].length, 12);
  assert.deepEqual(apply(db, { type: "billing.month", consultantId: "a", month: 12, values: { "2025": 1 } }, env), { ok: false, error: "invalid" });
});

test("consultant.goal writes the plan's yearly target and keeps the rest of the plan", () => {
  const db = dbOf(person({ plans: { "2026": { delivered: true, meetingHeld: false, listingTarget: 12 } } }));
  const r = apply(db, { type: "consultant.goal", consultantId: "a", year: "2026", value: 90000 }, env);
  assert.ok(r.ok);
  assert.deepEqual(r.db.consultants[0].plans!["2026"], { delivered: true, meetingHeld: false, listingTarget: 12, billingTarget: 90000 });
});

test("a listing's potential, partilha and expected values", () => {
  const db = dbOf(person());
  const r = apply(db, { type: "listing.save", listing: { consultantId: "a", kind: "moradia", price: 200000, commissionPct: 5 } }, env);
  assert.ok(r.ok);
  const l = r.db.listings![0] as Listing;
  assert.equal(l.status, "ativa");
  const row = listingRowOf(r.db, "a");
  assert.equal(row.ifPleno, 10000);
  assert.equal(row.ifPartilha, 5000);
  assert.equal(expected(row, 0.5), 7500);
  assert.deepEqual(apply(db, { type: "listing.save", listing: { consultantId: "a", kind: "moradia", price: 0, commissionPct: 5 } }, env), { ok: false, error: "invalid" });
});

test("the report stops at the chosen month and projects from there", () => {
  const db = dbOf(
    person({
      plans: { "2026": { delivered: true, meetingHeld: true, billingTarget: 120000 } },
      billingByMonth: { "2025": months(5000, 5000, 5000), "2026": months(10000, 10000, 10000, 90000) },
    }),
  );
  const r = buildReport(db, db.consultants[0], "2026", 2, NOV);
  assert.equal(r.billed, 30000);
  assert.equal(r.prevToDate, 15000);
  assert.equal(r.months[3], 0);
  assert.equal(r.monthlyAverage, 10000);
  assert.equal(r.projection, 120000);
  assert.equal(r.projectedLevel?.label, "Diamond");
  assert.equal(r.targets[0].missing, 90000);
  assert.equal(r.targets[0].perMonth, 10000);
  assert.equal(r.targets[1].label, "Ruby");
});

test("a consultant who joined mid-year is averaged over the months in the team", () => {
  const db = dbOf(person({ joinedAt: "2026-07-01", billingByMonth: { "2026": months(0, 0, 0, 0, 0, 0, 3000, 3000, 3000) } }));
  const r = buildReport(db, db.consultants[0], "2026", 8, NOV);
  assert.equal(r.monthlyAverage, 3000);
  assert.equal(r.projection, 18000);
});
