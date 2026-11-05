import { test } from "node:test";
import assert from "node:assert/strict";
import type { Consultant, Db, Deal } from "../src/app/reorgsi/core/types.ts";
import { emptyDb } from "../src/app/reorgsi/core/types.ts";
import { goalCoverage, idleListers, listedIn, listingConversion, listingTrend, planPace } from "../src/app/reorgsi/core/listings.ts";

const NOV = new Date(2026, 10, 5);
const months = (...v: number[]) => [...v, ...Array(12 - v.length).fill(0)];

function person(id: string, over: Partial<Consultant> = {}): Consultant {
  return { id, name: id, status: "experiente", billingByYear: {}, ...over };
}
const dbOf = (...consultants: Consultant[]): Db => ({ ...emptyDb(), consultants });
const plan = (listingTarget: number, billingTarget?: number) => ({ "2026": { delivered: true, meetingHeld: true, listingTarget, billingTarget } });

test("the trend compares closed months only", () => {
  const db = dbOf(person("a", { listingsByMonth: { "2025": months(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 50), "2026": months(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 9) } }));
  const t = listingTrend(db, "2026", NOV);
  assert.equal(t.upTo, 9);
  assert.equal(t.toDate, 20);
  assert.equal(t.prevToDate, 10);
  assert.equal(t.change, 1);
});

test("plan pace puts the furthest behind first and leaves out the inactive", () => {
  const db = dbOf(
    person("ahead", { plans: plan(12), listingsByMonth: { "2026": months(20) } }),
    person("behind", { plans: plan(12), listingsByMonth: { "2026": months(2) } }),
    person("gone", { status: "inativo", plans: plan(12) }),
    person("noplan"),
  );
  const p = planPace(db, "2026", NOV);
  assert.deepEqual(p.rows.map((r) => r.consultant.id), ["behind", "ahead"]);
  assert.equal(p.rows[0].due, 10);
  assert.equal(p.target, 24);
  assert.equal(p.done, 22);
});

test("idle: no listing in the last three closed months, with the last one found", () => {
  const db = dbOf(
    person("idle", { listingsByMonth: { "2026": months(0, 0, 0, 0, 1) } }),
    person("recent", { listingsByMonth: { "2026": months(0, 0, 0, 0, 0, 0, 0, 0, 1) } }),
    person("running", { listingsByMonth: { "2026": months(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1) } }),
    person("never", { listingsByMonth: { "2026": months() } }),
    person("nodata"),
    person("new", { joinedAt: "2026-09-15", listingsByMonth: { "2026": months() } }),
    person("gone", { status: "inativo", listingsByMonth: { "2026": months() } }),
  );
  assert.deepEqual(idleListers(db, "2026", NOV).map((i) => [i.consultant.id, i.last]), [["never", null], ["idle", "2026-05"]]);
});

test("idle looks back into last year early in the year", () => {
  const db = dbOf(person("a", { listingsByMonth: { "2025": months(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1), "2026": months() } }));
  assert.deepEqual(idleListers(db, "2026", new Date(2026, 1, 10)), []);
  assert.equal(idleListers(db, "2026", new Date(2026, 4, 10))[0].last, "2025-12");
});

test("conversion: sales of the year over listings of the year", () => {
  const sale = { id: "d", ref: "r", address: "x", transaction: "venda", dealTypeId: "pleno", angariacao: { kind: "team", consultantId: "a" }, listingSplitPct: 50, documents: {}, status: "concluido", createdAt: "2026-03-01" } as Deal;
  const db = { ...dbOf(person("a", { listingsByMonth: { "2026": months(4) } })), deals: [sale] };
  assert.deepEqual(listingConversion(db, "2026"), { sold: 1, listed: 4, rate: 0.25 });
  assert.equal(listedIn(db.consultants[0], "2026"), 4);
  assert.equal(listingConversion(dbOf(person("a")), "2026").rate, null);
});

test("coverage: expected commission over what is left of the goals", () => {
  const db: Db = {
    ...dbOf(
      person("a", { plans: plan(12, 100000), billingByMonth: { "2026": months(60000) } }),
      person("done", { plans: plan(12, 1000), billingByMonth: { "2026": months(5000) } }),
    ),
    listings: [
      { id: "l", consultantId: "a", kind: "moradia", price: 400000, commissionPct: 5, status: "ativa", createdAt: "2026-01-01" },
      { id: "m", consultantId: "done", kind: "moradia", price: 400000, commissionPct: 5, status: "ativa", createdAt: "2026-01-01" },
    ],
  };
  const c = goalCoverage(db, "2026", 0.5, NOV);
  assert.equal(c.people, 1);
  assert.equal(c.missing, 40000);
  assert.equal(c.expected, 15000);
  assert.equal(c.ratio, 0.375);
  assert.equal(goalCoverage(dbOf(person("a")), "2026", 0.5, NOV).ratio, null);
});
