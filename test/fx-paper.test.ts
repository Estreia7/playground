import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCandle,
  closePosition,
  unrealised,
  lotsForRisk,
  marginUsed,
  type PaperConfig,
} from "../src/app/api/fx/paper/engine.ts";
import type { Candle, Order, Position } from "../src/app/fx/types.ts";

/* The paper account decides whether this tool's setups actually make money, so
   the fills have to be pessimistic in the same places a real broker is. These
   tests pin the four rules that do that work: the spread, gap fills, stop
   before target, and pip arithmetic. */

const CONFIG: PaperConfig = {
  spreadPips: 1,
  pipSize: 0.0001,
  pipValuePerLotUsd: 10,
};

const BAR = 3600;
const START = 1_704_153_600;

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    pair: "EURUSD",
    tf: "1h",
    direction: "long",
    type: "market",
    price: null,
    lots: 1,
    stop: null,
    target: null,
    status: "pending",
    setupId: null,
    createdAt: new Date(START * 1000).toISOString(),
    placedBar: START,
    ...overrides,
  };
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: "p1",
    orderId: "o1",
    pair: "EURUSD",
    tf: "1h",
    direction: "long",
    lots: 1,
    entry: 1.1,
    stop: null,
    target: null,
    openedAt: new Date(START * 1000).toISOString(),
    openedBar: START,
    setupId: null,
    entryScore: null,
    entryEvidence: [],
    entryHtfAligned: null,
    mfePips: 0,
    maePips: 0,
    ...overrides,
  };
}

function candle(o: number, h: number, l: number, c: number, time = START + BAR): Candle {
  return [time, o, h, l, c];
}

test("a buy pays the spread and a sell does not", () => {
  const bar = candle(1.1, 1.101, 1.099, 1.1005);

  const long = applyCandle(bar, [order({ direction: "long" })], [], CONFIG);
  assert.equal(long.positions.length, 1);
  // Bid open 1.1000 + 1 pip spread.
  assert.ok(Math.abs(long.positions[0].entry - 1.1001) < 1e-9);

  const short = applyCandle(bar, [order({ direction: "short" })], [], CONFIG);
  assert.ok(Math.abs(short.positions[0].entry - 1.1) < 1e-9, "a short sells the bid, unshifted");
});

test("an order cannot fill on the bar it was placed against", () => {
  // The bar the order was placed on has already closed; we only know its shape
  // in hindsight, so filling on it would be trading with tomorrow's newspaper.
  const sameBar = candle(1.1, 1.101, 1.099, 1.1005, START);
  const result = applyCandle(sameBar, [order()], [], CONFIG);
  assert.equal(result.positions.length, 0);
});

test("a buy limit below the market fills at its price when touched", () => {
  const pending = order({ type: "limit", price: 1.098, direction: "long" });
  // A buy fills on the ask, which is one pip above the bid. A bid low of
  // 1.09795 is an ask low of 1.09805 — still above the limit, so no fill.
  const shallow = applyCandle(candle(1.1, 1.101, 1.09795, 1.0995), [pending], [], CONFIG);
  assert.equal(shallow.positions.length, 0, "the ask never reached the limit");

  // A bid low of 1.0975 is an ask low of 1.0976, through the 1.0980 limit.
  const deep = applyCandle(candle(1.1, 1.101, 1.0975, 1.0995), [pending], [], CONFIG);
  assert.equal(deep.positions.length, 1);
  assert.ok(Math.abs(deep.positions[0].entry - 1.098) < 1e-9, "fills at the limit price");
});

test("a bar that gaps through a stop order fills at the open, not the level", () => {
  const pending = order({ type: "stop", price: 1.105, direction: "long" });
  // Opens at 1.1070 bid, so 1.1071 on the ask — far above the 1.1050 trigger.
  const result = applyCandle(candle(1.107, 1.108, 1.1065, 1.1075), [pending], [], CONFIG);

  assert.equal(result.positions.length, 1);
  assert.ok(
    Math.abs(result.positions[0].entry - 1.1071) < 1e-9,
    "the market never traded at 1.1050, so the fill is the open ask",
  );
});

test("when one bar spans both the stop and the target, the stop wins", () => {
  const open = position({ entry: 1.1, stop: 1.099, target: 1.101 });
  // A wide bar that touches both levels. We cannot know which came first.
  const result = applyCandle(candle(1.1, 1.1015, 1.0985, 1.1), [], [open], CONFIG);

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitReason, "stop", "the pessimistic assumption is the stop");
  assert.ok(result.trades[0].pips < 0);
});

test("a position that opens beyond its stop exits at the open", () => {
  const open = position({ entry: 1.1, stop: 1.099 });
  // Gaps down to 1.0950, well through the stop.
  const result = applyCandle(candle(1.095, 1.0955, 1.094, 1.0945), [], [open], CONFIG);

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exit, 1.095, "filled at the gap open, not the stop level");
  assert.ok(result.trades[0].pips < -49, "the loss is the real one, not the intended one");
});

test("an order that fills and is stopped on the same bar is a real loss", () => {
  const pending = order({ type: "market", stop: 1.0995, direction: "long" });
  // Opens at 1.1000 bid (fills at 1.1001 ask), then falls through the stop.
  const result = applyCandle(candle(1.1, 1.1005, 1.099, 1.0992), [pending], [], CONFIG);

  assert.equal(result.positions.length, 0, "the position did not survive the bar");
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitReason, "stop");
});

test("a target is taken when the bar reaches it", () => {
  const open = position({ entry: 1.1, stop: 1.098, target: 1.102 });
  const result = applyCandle(candle(1.1, 1.1025, 1.0995, 1.102), [], [open], CONFIG);

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitReason, "target");
  assert.ok(Math.abs(result.trades[0].pips - 20) < 1e-6, "20 pips from 1.1000 to 1.1020");
});

test("excursions record how far the trade ran each way", () => {
  const open = position({ entry: 1.1 });
  // Runs up 15 pips and down 8 before closing flat, with no stop or target.
  const result = applyCandle(candle(1.1, 1.1015, 1.0992, 1.1), [], [open], CONFIG);

  assert.equal(result.trades.length, 0, "still open");
  const updated = result.positions[0];
  assert.ok(Math.abs(updated.mfePips - 15) < 1e-6);
  // The adverse excursion for a long is measured on the bid low.
  assert.ok(Math.abs(updated.maePips - -8) < 1e-6);
});

test("pips convert to dollars at ten per lot and R measures the risk taken", () => {
  const open = position({ entry: 1.1, stop: 1.098, lots: 2 });
  const trade = closePosition(open, 1.103, "manual", START + BAR, CONFIG);

  assert.ok(Math.abs(trade.pips - 30) < 1e-6);
  assert.ok(Math.abs(trade.usd - 600) < 1e-6, "30 pips x 10 USD x 2 lots");
  assert.ok(Math.abs((trade.r as number) - 1.5) < 1e-6, "30 pips won against 20 risked");
});

test("a trade with no stop has no R rather than a made-up one", () => {
  const trade = closePosition(position({ entry: 1.1, stop: null }), 1.101, "manual", START, CONFIG);
  assert.equal(trade.r, null);
});

test("a short makes money when price falls", () => {
  const open = position({ direction: "short", entry: 1.1, lots: 1 });
  const trade = closePosition(open, 1.098, "target", START + BAR, CONFIG);
  assert.ok(trade.pips > 0, "a short profits from a lower exit");
  assert.ok(Math.abs(trade.pips - 20) < 1e-6);
});

test("unrealised profit marks a position at the price it could close at", () => {
  const long = position({ entry: 1.1, lots: 1 });
  // Bid is 1.1010; a long closes on the bid, so it is 10 pips up.
  assert.ok(Math.abs(unrealised(long, 1.101, CONFIG) - 100) < 1e-6);

  const short = position({ direction: "short", entry: 1.1, lots: 1 });
  // A short closes by buying the ask: 1.1010 + 1 pip = 1.1011, so 11 pips
  // against it. The extra pip beyond the raw price move is the spread.
  assert.ok(Math.abs(unrealised(short, 1.101, CONFIG) - -110) < 1e-6);
});

test("position sizing never risks more than asked and rounds down", () => {
  // 1% of 10 000 is 100 USD. A 20-pip stop costs 200 USD per lot, so 0.5 lots.
  const lots = lotsForRisk(10_000, 1, 1.1, 1.098, CONFIG);
  assert.ok(Math.abs(lots - 0.5) < 1e-9);

  // A stop of zero cannot be sized against.
  assert.equal(lotsForRisk(10_000, 1, 1.1, 1.1, CONFIG), 0);

  // Rounding goes down, never up.
  const odd = lotsForRisk(10_000, 1, 1.1, 1.0993, CONFIG);
  assert.ok(odd * 7 * 10 <= 100 + 1e-9, "the rounded size must not exceed the risk budget");
});

test("margin is the notional divided by the leverage", () => {
  const used = marginUsed([position({ lots: 2 })], 30);
  assert.ok(Math.abs(used - (2 * 100_000) / 30) < 1e-6);
});
