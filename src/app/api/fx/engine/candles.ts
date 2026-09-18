import type { Candle, Evidence, Direction } from "../../../fx/types.ts";
import { T, O, H, L, C } from "../../../fx/types.ts";

/* Candlestick pattern detection.

   These are the classics, and the reason they earn a place next to the
   similarity engine is that they are cheap and they encode something the
   indicators miss: where price went *inside* the bar. RSI only sees closes, so
   a long lower wick that rejected a level is invisible to it.

   Every detector is measured against the recent average range rather than
   against absolute pip counts. A 12-pip body is a big bar at 3am and a nothing
   bar during the New York open, and a rule written in fixed pips would fire
   constantly on one and never on the other.

   Each detector returns at most one Evidence per bar, and all of them read
   only the bar in question and the two before it. */

export interface CandleContext {
  /** Average true range at each bar, used to size everything. */
  atr: number[];
}

interface Anatomy {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bullish: boolean;
  bearish: boolean;
}

function anatomy(candle: Candle): Anatomy {
  const open = candle[O];
  const close = candle[C];
  const high = candle[H];
  const low = candle[L];
  const body = Math.abs(close - open);
  return {
    body,
    range: high - low,
    upperWick: high - Math.max(open, close),
    lowerWick: Math.min(open, close) - low,
    bullish: close > open,
    bearish: close < open,
  };
}

/** Detect every pattern present at bar `i`. Returns [] for the warm-up bars. */
export function detectAt(candles: Candle[], i: number, ctx: CandleContext): Evidence[] {
  if (i < 2 || i >= candles.length) return [];
  const scale = ctx.atr[i];
  if (!Number.isFinite(scale) || scale <= 0) return [];

  const out: Evidence[] = [];
  const bar = candles[i];
  const prev = candles[i - 1];
  const prev2 = candles[i - 2];
  const a = anatomy(bar);
  const p = anatomy(prev);
  const p2 = anatomy(prev2);
  const time = bar[T];

  // --- Engulfing -----------------------------------------------------------
  // The current body swallows the previous body whole and reverses its
  // direction. Requiring the previous bar to have a real body keeps this from
  // firing on every doji the market prints.
  const bodiesMeaningful = p.body > scale * 0.15 && a.body > p.body;
  if (bodiesMeaningful && a.bullish && p.bearish && bar[C] >= prev[O] && bar[O] <= prev[C]) {
    out.push(mk("candle", "Bullish engulfing", "long", time, strength(a.body / scale, 0.5, 1.6),
      "This bar's body covers the whole of the previous down bar and closed higher."));
  }
  if (bodiesMeaningful && a.bearish && p.bullish && bar[C] <= prev[O] && bar[O] >= prev[C]) {
    out.push(mk("candle", "Bearish engulfing", "short", time, strength(a.body / scale, 0.5, 1.6),
      "This bar's body covers the whole of the previous up bar and closed lower."));
  }

  // --- Pin bars ------------------------------------------------------------
  // A long wick against a small body: price went somewhere and was rejected.
  // Two-thirds of the range in one wick is the usual threshold.
  if (a.range > scale * 0.6) {
    if (a.lowerWick > a.range * 0.6 && a.body < a.range * 0.35 && a.upperWick < a.range * 0.2) {
      out.push(mk("candle", "Hammer", "long", time, strength(a.lowerWick / a.range, 0.6, 0.85),
        "A long lower wick: sellers pushed price down and it closed back near the top."));
    }
    if (a.upperWick > a.range * 0.6 && a.body < a.range * 0.35 && a.lowerWick < a.range * 0.2) {
      out.push(mk("candle", "Shooting star", "short", time, strength(a.upperWick / a.range, 0.6, 0.85),
        "A long upper wick: buyers pushed price up and it closed back near the bottom."));
    }
  }

  // --- Doji ----------------------------------------------------------------
  // Open and close within a tenth of the range, on a bar with a real range.
  // Neutral on its own — it earns its keep as a reversal component below.
  if (a.range > scale * 0.5 && a.body < a.range * 0.1) {
    out.push(mk("candle", "Doji", "neutral", time, 0.35,
      "Open and close are almost the same: the two sides finished level."));
  }

  // --- Inside bar ----------------------------------------------------------
  // Contraction. Direction comes from the bar it is contracting inside.
  if (bar[H] <= prev[H] && bar[L] >= prev[L] && p.range > scale * 0.7) {
    const dir: Direction | "neutral" = p.bullish ? "long" : p.bearish ? "short" : "neutral";
    out.push(mk("candle", "Inside bar", dir, time, 0.3,
      "The whole bar sits inside the previous one: the market paused."));
  }

  // --- Morning / evening star ---------------------------------------------
  // Three bars: a strong move, a small indecisive bar, then a strong move back
  // through more than half of the first body.
  const smallMiddle = p.body < p2.body * 0.5 && p.body < scale * 0.4;
  if (smallMiddle && p2.bearish && a.bullish && p2.body > scale * 0.4) {
    const midpoint = prev2[O] - (prev2[O] - prev2[C]) / 2;
    if (bar[C] > midpoint) {
      out.push(mk("candle", "Morning star", "long", time, strength((bar[C] - midpoint) / scale, 0, 0.8),
        "A down bar, a pause, then a strong up bar that recovered more than half of the fall."));
    }
  }
  if (smallMiddle && p2.bullish && a.bearish && p2.body > scale * 0.4) {
    const midpoint = prev2[O] + (prev2[C] - prev2[O]) / 2;
    if (bar[C] < midpoint) {
      out.push(mk("candle", "Evening star", "short", time, strength((midpoint - bar[C]) / scale, 0, 0.8),
        "An up bar, a pause, then a strong down bar that gave back more than half of the rise."));
    }
  }

  // --- Marubozu ------------------------------------------------------------
  // Body is nearly the whole range and the range is large: one-way traffic.
  if (a.range > scale * 1.1 && a.body > a.range * 0.85) {
    out.push(mk("candle", a.bullish ? "Strong bull bar" : "Strong bear bar", a.bullish ? "long" : "short",
      time, strength(a.range / scale, 1.1, 2.2),
      "Almost no wick on a large bar: one side controlled the whole session."));
  }

  return out;
}

/** Run the detector across a range of bars, newest last. */
export function detectRange(
  candles: Candle[],
  ctx: CandleContext,
  from: number,
  to: number,
): Evidence[] {
  const out: Evidence[] = [];
  for (let i = Math.max(2, from); i < Math.min(to, candles.length); i++) {
    out.push(...detectAt(candles, i, ctx));
  }
  return out;
}

function mk(
  kind: Evidence["kind"],
  name: string,
  direction: Evidence["direction"],
  barTime: number,
  strengthValue: number,
  detail: string,
): Evidence {
  return { kind, name, direction, barTime, strength: strengthValue, detail };
}

/** Map a raw ratio onto 0..1 between `min` and `max`, so a pattern that only
    just qualifies scores lower than a textbook one. */
function strength(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0.3;
  if (max <= min) return 0.5;
  const t = (value - min) / (max - min);
  return Math.min(1, Math.max(0.25, t));
}
