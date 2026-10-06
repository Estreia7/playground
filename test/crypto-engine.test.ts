import { test } from "node:test";
import assert from "node:assert/strict";
import { bmsOf, marketSummary, signalsOf, weeklyCloses, zoneOf, type DailyClose } from "../src/app/api/crypto/engine/signals.ts";
import { analyseCycles, median, relativePath, type Point } from "../src/app/api/crypto/engine/cycles.ts";
import { estimateNupl, nuplBand, profitLabel } from "../src/app/api/crypto/engine/nupl.ts";
import { addPayment, directionOf, rebucket, summarise, WHALE_XRP } from "../src/app/api/crypto/engine/flow.ts";
import { paymentOf } from "../src/app/api/crypto/xrpl/collector.ts";

const DAY = 86400;
// 2024-01-01 was a Monday.
const MON = Date.UTC(2024, 0, 1) / 1000;

/* ── signals ─────────────────────────────────────────────────────────── */

test("RSI zones split at 30 / 40 / 60 / 70", () => {
  assert.equal(zoneOf(25), "buy");
  assert.equal(zoneOf(30), "buy");
  assert.equal(zoneOf(35), "buy-warning");
  assert.equal(zoneOf(50), "neutral");
  assert.equal(zoneOf(65), "sell-warning");
  assert.equal(zoneOf(70), "sell");
});

test("weekly closes take the last close of each Monday-based week", () => {
  const daily: DailyClose[] = Array.from({ length: 15 }, (_, i) => [MON + i * DAY, i + 1]);
  // Mon..Sun = days 1..7, then 8..14, then a partial week with day 15.
  assert.deepEqual(weeklyCloses(daily), [7, 14, 15]);
});

test("BMS: above the band is bull, far above is strong, inside is in-band", () => {
  assert.equal(bmsOf(110, 100, 95).state, "mild-bull");
  assert.ok(Math.abs(bmsOf(110, 100, 95).distance - 0.1) < 1e-9);
  assert.equal(bmsOf(110, 100, 95).level, 100);
  assert.equal(bmsOf(140, 100, 95).state, "strong-bull");
  assert.equal(bmsOf(97, 100, 95).state, "in-band");
  assert.equal(bmsOf(90, 100, 95).state, "mild-bear");
  assert.equal(bmsOf(90, 100, 95).level, 95);
  assert.equal(bmsOf(60, 100, 95).state, "strong-bear");
});

test("signals need enough history and are null without it", () => {
  const short: DailyClose[] = Array.from({ length: 10 }, (_, i) => [MON + i * DAY, 100 + i]);
  assert.deepEqual(signalsOf(short), { micro: null, macro: null, bms: null });

  // A steady climb: daily and weekly RSI both pinned high, price above the band.
  const up: DailyClose[] = Array.from({ length: 400 }, (_, i) => [MON + i * DAY, 100 * 1.003 ** i]);
  const s = signalsOf(up);
  assert.equal(s.micro, 100);
  assert.equal(s.macro, 100);
  assert.equal(s.bms?.state, "mild-bull");
});

test("market summary averages readings and counts zone shares", () => {
  const m = marketSummary([20, 35, 50, 50, 65, 80, null]);
  assert.equal(m.counted, 6);
  assert.equal(m.level, 50);
  const share = Object.fromEntries(m.zones.map((z) => [z.zone, z.share]));
  assert.equal(share.buy, 1 / 6);
  assert.equal(share["sell-warning"], 1 / 6);
  assert.equal(marketSummary([null]).level, null);
});

/* ── cycles ──────────────────────────────────────────────────────────── */

/** Build a daily series by walking linearly between [dayIndex, price] knots. */
function path(knots: [number, number][]): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < knots.length - 1; k++) {
    const [d0, p0] = knots[k];
    const [d1, p1] = knots[k + 1];
    for (let d = d0; d < d1; d++) out.push([MON + d * DAY, p0 + ((p1 - p0) * (d - d0)) / (d1 - d0)]);
  }
  const [dl, pl] = knots[knots.length - 1];
  out.push([MON + dl * DAY, pl]);
  return out;
}

test("a deep, lasting fall from a high is a bear market; the rise into it a bull", () => {
  // 1 → 100 (bull), → 20 (-80%), back above 100 more than a year later.
  const s = path([[0, 1], [300, 100], [600, 20], [1100, 150], [1200, 160]]);
  const a = analyseCycles(s);
  assert.equal(a.bears.length, 1);
  assert.equal(a.bears[0].top[1], 100);
  assert.equal(a.bears[0].low[1], 20);
  assert.ok(Math.abs(a.bears[0].drawdown - 0.8) < 1e-9);
  assert.equal(a.bears[0].days, 300);
  assert.equal(a.bulls.length, 2);
  assert.equal(a.bulls[0].multiple, 100);
  assert.equal(a.bulls[1].current, true);
  assert.equal(a.bulls[1].low[1], 20);
  assert.equal(a.bulls[1].top[1], 160);
  assert.equal(a.phase, "bull");
});

test("a sharp drop that is recovered within a year is not a cycle", () => {
  // -55% but a new high 150 days later.
  const s = path([[0, 10], [100, 100], [160, 45], [250, 120], [400, 130]]);
  assert.equal(analyseCycles(s).bears.length, 0);
});

test("an unresolved bear stays in bear phase until price rebounds 20% off the low", () => {
  const falling = path([[0, 1], [300, 100], [500, 40], [520, 44]]);
  const a = analyseCycles(falling);
  assert.equal(a.bears.length, 1);
  assert.equal(a.bears[0].recovered, null);
  assert.equal(a.phase, "bear");
  assert.equal(a.bulls.filter((b) => b.current).length, 0);

  const rebounding = path([[0, 1], [300, 100], [500, 40], [560, 60]]);
  const b = analyseCycles(rebounding);
  assert.equal(b.phase, "bull");
  const current = b.bulls.find((x) => x.current);
  assert.equal(current?.low[1], 40);
  assert.equal(current?.multiple, 1.5);
});

test("a high in the first days of the data is not a cycle top", () => {
  // Listed at the top of a crash: no bear measured from the first trade.
  const s = path([[0, 100], [200, 10], [700, 30]]);
  assert.equal(analyseCycles(s).bears.length, 0);
});

test("relative paths start at 1 and report days since the start", () => {
  const s = path([[0, 10], [10, 20]]);
  const p = relativePath(s, s[0], s[10]);
  assert.deepEqual(p[0], [0, 1]);
  assert.deepEqual(p[p.length - 1], [10, 2]);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

/* ── NUPL estimate ───────────────────────────────────────────────────── */

test("NUPL estimate: cost basis drifts toward traded prices at the turnover rate", () => {
  // Supply 1000, volume 100/day at turnover 0.5 → 5% repriced a day.
  const rows: [number, number, number, number][] = [
    [0, 1, 100, 100],
    [DAY, 2, 100, 200],
  ];
  const { points: out, settled } = estimateNupl(rows, 1000, 0.5);
  // 95% of the seed still stands after one day: not settled, so show all.
  assert.equal(settled, 0);
  assert.deepEqual(out[0], [0, 1, 0, 1]);
  const cost = 1 * 0.95 + 2 * 0.05;
  assert.ok(Math.abs(out[1][3] - cost) < 1e-12);
  assert.ok(Math.abs(out[1][2] - (1 - cost / 2)) < 1e-12);
});

test("NUPL is drawn from the day the starting guess has mostly faded", () => {
  // 30% repriced a day: the seed share falls 1 → 0.7 → 0.49 → 0.34 → 0.24.
  const rows: [number, number, number, number][] = Array.from({ length: 6 }, (_, i) => [i * DAY, 1, 600, 600]);
  assert.equal(estimateNupl(rows, 1000, 0.5).settled, 4);
});

test("NUPL bands and profit labels", () => {
  assert.equal(nuplBand(-0.4).key, "capitulation");
  assert.equal(nuplBand(-0.1).key, "hope");
  assert.equal(nuplBand(0.0126).key, "optimism");
  assert.equal(nuplBand(0.3).key, "belief");
  assert.equal(nuplBand(0.6).key, "euphoria");
  assert.equal(profitLabel(0.0126), "Limited profit");
  assert.equal(profitLabel(-0.3), "Deep loss");
});

/* ── XRP flows ───────────────────────────────────────────────────────── */

const EX = new Map([
  ["rExchangeA", "Binance"],
  ["rExchangeB", "Kraken"],
]);

test("payments into exchanges are inflows, out of them outflows, between them neither", () => {
  const t = MON;
  assert.equal(directionOf({ from: "rUser", to: "rExchangeA", xrp: 1, time: t }, EX), "in");
  assert.equal(directionOf({ from: "rExchangeA", to: "rUser", xrp: 1, time: t }, EX), "out");
  assert.equal(directionOf({ from: "rExchangeA", to: "rExchangeB", xrp: 1, time: t }, EX), null);
  assert.equal(directionOf({ from: "rUser", to: "rOther", xrp: 1, time: t }, EX), null);
});

test("flows land in hourly buckets split by whale size, and re-bucket to days", () => {
  const b = new Map();
  addPayment(b, { from: "rUser", to: "rExchangeA", xrp: WHALE_XRP, time: MON + 10 }, EX);
  addPayment(b, { from: "rUser", to: "rExchangeA", xrp: 500, time: MON + 20 }, EX);
  addPayment(b, { from: "rExchangeB", to: "rUser", xrp: 300, time: MON + 3600 * 5 }, EX);
  assert.equal(addPayment(b, { from: "rExchangeA", to: "rExchangeB", xrp: 9, time: MON }, EX), false);
  const hourly = [...b.values()].sort((x, y) => x.t - y.t);
  assert.equal(hourly.length, 2);
  assert.equal(hourly[0].inWhale, WHALE_XRP);
  assert.equal(hourly[0].inSmall, 500);
  assert.equal(hourly[0].count, 2);
  const daily = rebucket(hourly, DAY);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].outSmall, 300);

  const s = summarise(daily);
  assert.equal(s.net, WHALE_XRP + 500 - 300);
  assert.equal(s.signal, "net-inflow");
  assert.equal(s.dominance, "whale-deposits");
});

test("ledger entries parse to XRP payments; issued currencies and failures do not", () => {
  const base = {
    tx: { TransactionType: "Payment", Account: "rA", Destination: "rB", date: 800000000, hash: "H1", ledger_index: 5 },
    meta: { TransactionResult: "tesSUCCESS", delivered_amount: "2500000" },
  };
  const p = paymentOf(base);
  assert.equal(p?.xrp, 2.5);
  assert.equal(p?.time, 800000000 + 946684800);
  assert.equal(p?.hash, "H1");
  assert.equal(paymentOf({ ...base, meta: { TransactionResult: "tesSUCCESS", delivered_amount: { currency: "USD", value: "1" } } }), null);
  assert.equal(paymentOf({ ...base, meta: { TransactionResult: "tecPATH_DRY", delivered_amount: "1" } }), null);
  // Stream messages carry the transaction under tx_json (API v2) with the hash beside it.
  const v2 = { tx_json: { ...base.tx, hash: undefined }, meta: base.meta, hash: "H2", ledger_index: 9 };
  assert.equal(paymentOf(v2)?.hash, "H2");
  assert.equal(paymentOf(v2)?.ledger, 9);
});
