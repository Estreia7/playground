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

/* ── life projection ─────────────────────────────────────── */

import { projectLife } from "../src/app/lfp/econ.ts";

test("projectLife: retires at the right age, real income is flat with zero real growth", () => {
  const r = projectLife({
    idade: 30,
    liquidoMensal: 1000,
    crescimentoReal: 0,
    inflacao: 0.02,
    poupancaMensal: 0,
    rendimentoPoupanca: 0,
    idadeReforma: 66.75,
    pensaoPct: 0.7,
    idadeFinal: 80,
  });
  assert.equal(r.series[0].idade, 30);
  assert.equal(r.series[r.series.length - 1].idade, 80);
  assert.equal(r.anosAteReforma, 37);
  assert.equal(r.series[37].retired, true);
  assert.equal(r.series[36].retired, false);
  // Nominal grows with inflation, real stays put.
  assert.equal(r.series[36].incomeReal, 1000);
  assert.ok(r.series[36].incomeNominal > 2000);
  assert.equal(r.ultimoLiquidoReal, 1000);
  assert.equal(r.pensaoReal, 700);
  assert.equal(r.gapMensalReal, 300);
  assert.equal(r.poupancaNominal, 0);
  assert.equal(r.anosCobertos, 0);
});

test("projectLife: savings cover the gap for a computable number of years", () => {
  const r = projectLife({
    idade: 60,
    liquidoMensal: 1000,
    crescimentoReal: 0,
    inflacao: 0,
    poupancaMensal: 100,
    rendimentoPoupanca: 0,
    idadeReforma: 65,
    pensaoPct: 0.5,
    idadeFinal: 70,
  });
  // 5 years × 12 × €100 = €6 000 saved; the gap is €500/month = €6 000/year.
  assert.equal(r.poupancaNominal, 6000);
  assert.equal(r.gapMensalReal, 500);
  assert.equal(r.anosCobertos, 1);
});

test("projectLife: no gap when the pension matches the salary", () => {
  const r = projectLife({ idade: 60, liquidoMensal: 1000, crescimentoReal: 0, inflacao: 0, poupancaMensal: 0, rendimentoPoupanca: 0, idadeReforma: 65, pensaoPct: 1, idadeFinal: 70 });
  assert.equal(r.gapMensalReal, 0);
  assert.equal(r.anosCobertos, null);
});

/* ── where you stand ─────────────────────────────────────── */

import { wageStanding } from "../src/app/lfp/econ.ts";

const anchors = [
  { percentile: 10, value: 814, label: "D1" },
  { percentile: 50, value: 1099, label: "median" },
  { percentile: 90, value: 2612, label: "D9" },
];

test("wageStanding lands exactly on the published anchors", () => {
  assert.equal(wageStanding(814, anchors)!.estimate, 10);
  assert.equal(wageStanding(1099, anchors)!.estimate, 50);
  assert.equal(wageStanding(2612, anchors)!.estimate, 90);
});

test("wageStanding reports a bound, not a number, outside the anchors", () => {
  const low = wageStanding(600, anchors)!;
  assert.equal(low.outside, "below");
  assert.equal(low.low, 0);
  assert.equal(low.high, 10);
  const high = wageStanding(5000, anchors)!;
  assert.equal(high.outside, "above");
  assert.equal(high.low, 90);
  assert.equal(high.high, 100);
});

test("wageStanding interpolates inside the right span and stays monotone", () => {
  const r = wageStanding(1500, anchors)!;
  assert.equal(r.outside, null);
  assert.equal(r.low, 50);
  assert.equal(r.high, 90);
  assert.ok(r.estimate > 50 && r.estimate < 90);
  // Log space, not euros: the median→D9 span is wide (€1,099→€2,612), and a
  // straight line in euros treats the first €100 above the median as worth
  // the same as the last €100 below D9. On a right-skewed distribution far
  // more people sit just above the median, so log puts €1,500 at ~64 where
  // a linear reading would say ~61.
  assert.ok(Math.abs(r.estimate - 64.4) < 0.2, `expected ~64.4, got ${r.estimate}`);
  let prev = -1;
  for (const w of [700, 814, 900, 1099, 1400, 1800, 2612, 4000]) {
    const e = wageStanding(w, anchors)!.estimate;
    assert.ok(e >= prev, `not monotone at ${w}: ${e} < ${prev}`);
    prev = e;
  }
});

test("wageStanding refuses to guess without enough anchors", () => {
  assert.equal(wageStanding(1000, []), null);
  assert.equal(wageStanding(1000, [anchors[0]]), null);
  assert.equal(wageStanding(Number.NaN, anchors), null);
});

test("the published distribution dataset is ordered and complete", () => {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "storage", "lfp", "econ", "distribution.json"), "utf8"));
  assert.ok(d.meta.year >= 2018);
  assert.ok(d.meta.source.startsWith("https://"));
  assert.equal(d.points.length, 3);
  for (let i = 1; i < d.points.length; i++) {
    assert.ok(d.points[i].percentile > d.points[i - 1].percentile);
    assert.ok(d.points[i].value > d.points[i - 1].value);
  }
  // The mean sits above the median in every real wage distribution.
  assert.ok(d.mean > d.points[1].value);
});
