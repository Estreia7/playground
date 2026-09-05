import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  adjustForInflation,
  annualisedInflation,
  compoundInterest,
  cumulativeInflation,
  daysOfWork,
  inflationFactor,
  realRaise,
  wagePercentile,
  yearlyInflation,
} from "../src/app/lfp/econ.ts";

/* ── inflation, on a synthetic series ───────────────────── */

const idx = { "2000": 50, "2010": 75, "2020": 100, "2025": 110 };

test("inflationFactor is the index ratio and null off the series", () => {
  assert.equal(inflationFactor(idx, 2000, 2020), 2);
  assert.equal(inflationFactor(idx, 2020, 2000), 0.5);
  assert.equal(inflationFactor(idx, 1990, 2020), null);
  assert.equal(inflationFactor(idx, 2000, 2030), null);
});

test("adjustForInflation moves money forward and back", () => {
  assert.equal(adjustForInflation(100, idx, 2000, 2020), 200);
  assert.equal(adjustForInflation(200, idx, 2020, 2000), 100);
  assert.equal(adjustForInflation(100, idx, 2010, 2025), round(100 * (110 / 75)));
});

test("cumulative and annualised inflation agree with each other", () => {
  const cum = cumulativeInflation(idx, 2000, 2020)!;
  const ann = annualisedInflation(idx, 2000, 2020)!;
  assert.equal(cum, 1); // doubled
  assert.ok(Math.abs(Math.pow(1 + ann, 20) - 2) < 1e-9);
  assert.equal(annualisedInflation(idx, 2020, 2020), null);
});

test("yearlyInflation computes year-on-year rates in order", () => {
  const y = yearlyInflation({ "2020": 100, "2021": 102, "2022": 110.16 });
  assert.equal(y.length, 2);
  assert.equal(y[0].year, 2021);
  assert.ok(Math.abs(y[0].rate - 0.02) < 1e-9);
  assert.ok(Math.abs(y[1].rate - 0.08) < 1e-9);
});

/* ── inflation, on the PUBLISHED series ─────────────────── */

const inflationFile = path.join(process.cwd(), "storage", "lfp", "econ", "inflation.json");

test("published HICP series is continuous, rising overall, and cites its source", () => {
  const d = JSON.parse(fs.readFileSync(inflationFile, "utf8"));
  assert.equal(d.geo, "PT");
  assert.match(d.meta.sourceUrl, /^https:\/\/ec\.europa\.eu\//);
  assert.match(d.meta.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
  const years = Object.keys(d.values).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < years.length; i++) assert.equal(years[i], years[i - 1] + 1, `gap at ${years[i]}`);
  assert.equal(years[0], d.firstYear);
  assert.equal(years[years.length - 1], d.lastYear);
  // Base year 2015 = 100 by definition of the series.
  assert.ok(Math.abs(d.values["2015"] - 100) < 0.5);
  // Prices in Portugal have not fallen by half over any decade in this span.
  assert.ok(d.values[String(d.lastYear)] > d.values[String(d.firstYear)]);
});

test("EUR 100 in 1999 is worth more than EUR 150 today on the published series", () => {
  const d = JSON.parse(fs.readFileSync(inflationFile, "utf8"));
  const v = adjustForInflation(100, d.values, 1999, d.lastYear)!;
  assert.ok(v > 150 && v < 250, `got ${v}`);
});

/* ── real raise ─────────────────────────────────────────── */

test("realRaise divides, it does not subtract", () => {
  // 3% raise under 4% inflation is a cut...
  assert.ok(realRaise(0.03, 0.04) < 0);
  // ...and the exact figure is (1.03/1.04)-1, not -0.01.
  assert.ok(Math.abs(realRaise(0.03, 0.04) - (1.03 / 1.04 - 1)) < 1e-12);
  assert.notEqual(realRaise(0.10, 0.05), 0.05);
  assert.equal(realRaise(0.05, 0.05), 0);
});

/* ── compound interest ──────────────────────────────────── */

test("compoundInterest with no rate is just the contributions", () => {
  const r = compoundInterest({ principal: 1000, monthly: 100, annualRate: 0, years: 2 });
  assert.equal(r.finalValue, 1000 + 100 * 24);
  assert.equal(r.totalInterest, 0);
  assert.equal(r.series.length, 3);
  assert.equal(r.series[0].value, 1000);
});

test("compoundInterest matches the closed form for a lump sum", () => {
  const r = compoundInterest({ principal: 10000, monthly: 0, annualRate: 0.06, years: 10 });
  const closed = 10000 * Math.pow(1 + 0.06 / 12, 120);
  assert.ok(Math.abs(r.finalValue - closed) < 0.01, `${r.finalValue} vs ${closed}`);
  assert.equal(r.totalContributed, 10000);
});

test("compoundInterest: monthly contributions earn less than a lump sum of the same total", () => {
  const lump = compoundInterest({ principal: 12000, monthly: 0, annualRate: 0.05, years: 1 });
  const drip = compoundInterest({ principal: 0, monthly: 1000, annualRate: 0.05, years: 1 });
  assert.equal(lump.totalContributed, drip.totalContributed);
  assert.ok(lump.finalValue > drip.finalValue);
});

test("compoundInterest series is monotonic and ends at the final value", () => {
  const r = compoundInterest({ principal: 500, monthly: 50, annualRate: 0.04, years: 30 });
  for (let i = 1; i < r.series.length; i++) assert.ok(r.series[i].value > r.series[i - 1].value);
  assert.equal(r.series[r.series.length - 1].value, r.finalValue);
  assert.equal(r.series[r.series.length - 1].contributed, r.totalContributed);
});

test("compoundInterest clamps nonsense input", () => {
  const r = compoundInterest({ principal: -5, monthly: -1, annualRate: NaN, years: -3 });
  assert.equal(r.finalValue, 0);
  assert.equal(r.series.length, 1);
});

/* ── days of work ───────────────────────────────────────── */

test("daysOfWork divides price by the daily net wage", () => {
  assert.equal(daysOfWork(1100, 22000, 220), 11);
  assert.equal(daysOfWork(0, 22000), 0);
  assert.equal(daysOfWork(100, 0), null);
});

/* ── wage percentile ────────────────────────────────────── */

const brackets = [
  { from: 0, to: 1000, share: 0.3 },
  { from: 1000, to: 2000, share: 0.5 },
  { from: 2000, to: null, share: 0.2 },
];

test("wagePercentile returns the bracket's cumulative range", () => {
  const p = wagePercentile(1500, brackets)!;
  assert.equal(p.low, 0.3);
  assert.ok(Math.abs(p.high - 0.8) < 1e-12);
  assert.equal(p.bracketIndex, 1);
  // halfway through the bracket → halfway through its share
  assert.ok(Math.abs(p.estimate - 0.55) < 1e-12);
});

test("wagePercentile is monotonic in wage", () => {
  let prev = -1;
  for (let w = 0; w <= 5000; w += 100) {
    const e = wagePercentile(w, brackets)!.estimate;
    assert.ok(e >= prev, `dropped at ${w}`);
    prev = e;
  }
});

test("wagePercentile handles the open top bracket and normalises shares", () => {
  const top = wagePercentile(9999, brackets)!;
  assert.equal(top.bracketIndex, 2);
  assert.ok(Math.abs(top.low - 0.8) < 1e-12);
  assert.equal(top.high, 1);
  // shares that do not sum to 1 are normalised, not trusted
  const p = wagePercentile(1500, brackets.map((b) => ({ ...b, share: b.share * 2 })))!;
  assert.equal(p.low, 0.3);
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
