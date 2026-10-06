/* Bull and bear market cycles from daily closes.

   A cycle top is an all-time high that is followed by a deep and lasting
   fall: at least MIN_DRAWDOWN below the high, with the high not taken back
   for at least MIN_DAYS (or not taken back yet). The bear market runs from
   that top to the lowest close before the high is regained; the bull market
   runs from the previous bear's low to the next top.

   On Bitcoin this finds the cycles everyone names — the 2011, 2013, 2017,
   2021 and 2025 tops and the lows a year or so after each — and skips the
   sharp mid-cycle drops (April–July 2021 fell 54% but was back at a new high
   within six months).

   The last bear can still be running. Its low is then only the lowest close
   so far, and the bull that follows it is provisional: it is the current
   cycle until price either makes a new low (and the bear resumes) or a new
   high (and the cycle is confirmed). */

export const MIN_DRAWDOWN = 0.5;
export const MIN_DAYS = 365;
/** A high in the first days of the data is where the history starts, not a
    top the market made: a coin listed mid-crash would otherwise get a bear
    market measured from its first trade. */
export const START_GRACE_DAYS = 30;

const DAY = 86400;

export type Point = [t: number, price: number];

export interface Bear {
  top: Point;
  low: Point;
  /** First close above the top, or null while the bear is unresolved. */
  recovered: Point | null;
  drawdown: number;
  days: number;
}

export interface Bull {
  low: Point;
  top: Point;
  /** top / low */
  multiple: number;
  days: number;
  /** True for the bull still running: its top is the high so far. */
  current: boolean;
}

export interface CycleAnalysis {
  bears: Bear[];
  bulls: Bull[];
  /** "bull" when price is above the last bear's low by at least a rebound
      threshold or the last bear is resolved; "bear" otherwise. */
  phase: "bull" | "bear";
}

interface Episode {
  top: Point;
  low: Point | null;
  recovered: Point | null;
}

/** Drawdown episodes between consecutive all-time highs. */
function episodes(series: Point[]): Episode[] {
  const out: Episode[] = [];
  if (!series.length) return out;
  let current: Episode = { top: series[0], low: null, recovered: null };
  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    if (p[1] > current.top[1]) {
      if (current.low) {
        current.recovered = p;
        out.push(current);
      }
      current = { top: p, low: null, recovered: null };
    } else if (!current.low || p[1] < current.low[1]) {
      current.low = p;
    }
  }
  if (current.low) out.push(current);
  return out;
}

/** Price must clear the provisional low by this much before a new bull is
    called. Without it the first green day after any low would flip the phase. */
export const REBOUND = 0.2;

export function analyseCycles(series: Point[], opts: { minDrawdown?: number; minDays?: number } = {}): CycleAnalysis {
  const minDrawdown = opts.minDrawdown ?? MIN_DRAWDOWN;
  const minDays = opts.minDays ?? MIN_DAYS;
  if (series.length < 2) return { bears: [], bulls: [], phase: "bull" };
  const start = series[0][0];
  const end = series[series.length - 1];

  const bears: Bear[] = [];
  for (const e of episodes(series)) {
    if (!e.low) continue;
    if (e.top[0] - start < START_GRACE_DAYS * DAY) continue;
    const drawdown = 1 - e.low[1] / e.top[1];
    const span = ((e.recovered ? e.recovered[0] : end[0]) - e.top[0]) / DAY;
    if (drawdown < minDrawdown) continue;
    if (e.recovered && span < minDays) continue;
    bears.push({
      top: e.top,
      low: e.low,
      recovered: e.recovered,
      drawdown,
      days: Math.round((e.low[0] - e.top[0]) / DAY),
    });
  }

  // Each bull starts at the lowest close before its top and after the
  // previous top. For every bull but the first that is the previous bear's
  // low; for the first it is the low of the history up to that top.
  const bulls: Bull[] = [];
  let from = 0;
  for (const bear of bears) {
    const to = series.findIndex((p) => p[0] === bear.top[0]);
    const low = lowest(series, from, to);
    if (low && low[0] < bear.top[0]) bulls.push(makeBull(low, bear.top, false));
    from = to;
  }

  // The cycle after the last bear.
  const lastBear = bears[bears.length - 1];
  let phase: "bull" | "bear" = "bull";
  if (lastBear) {
    const after = series.findIndex((p) => p[0] === lastBear.low[0]);
    const high = highest(series, after, series.length - 1);
    const rebounded = end[1] >= lastBear.low[1] * (1 + REBOUND);
    if (lastBear.recovered || rebounded) {
      if (high && high[0] > lastBear.low[0]) bulls.push(makeBull(lastBear.low, high, true));
    } else {
      phase = "bear";
    }
  } else {
    // No completed cycle at all: the whole history is one bull from its low.
    const low = lowest(series, 0, series.length - 1);
    const high = low ? highest(series, series.findIndex((p) => p[0] === low[0]), series.length - 1) : null;
    if (low && high && high[0] > low[0]) bulls.push(makeBull(low, high, true));
  }

  return { bears, bulls, phase };
}

function makeBull(low: Point, top: Point, current: boolean): Bull {
  return { low, top, multiple: top[1] / low[1], days: Math.round((top[0] - low[0]) / DAY), current };
}

function lowest(series: Point[], from: number, to: number): Point | null {
  let best: Point | null = null;
  for (let i = Math.max(0, from); i <= to && i < series.length; i++) {
    if (!best || series[i][1] < best[1]) best = series[i];
  }
  return best;
}

function highest(series: Point[], from: number, to: number): Point | null {
  let best: Point | null = null;
  for (let i = Math.max(0, from); i <= to && i < series.length; i++) {
    if (!best || series[i][1] > best[1]) best = series[i];
  }
  return best;
}

/** The price path of a cycle relative to its start: [days since start,
    price / start price]. For a bull that is the expansion multiple, for a
    bear the fraction of the top that is left. */
export function relativePath(series: Point[], from: Point, to: Point | null, maxPoints = 400): [number, number][] {
  const i0 = series.findIndex((p) => p[0] === from[0]);
  if (i0 < 0) return [];
  const i1 = to ? series.findIndex((p) => p[0] === to[0]) : series.length - 1;
  const slice = series.slice(i0, (i1 < 0 ? series.length - 1 : i1) + 1);
  const step = Math.max(1, Math.ceil(slice.length / maxPoints));
  const out: [number, number][] = [];
  for (let i = 0; i < slice.length; i += step) {
    out.push([Math.round((slice[i][0] - from[0]) / DAY), slice[i][1] / from[1]]);
  }
  const lastPoint = slice[slice.length - 1];
  if (out.length && out[out.length - 1][0] !== Math.round((lastPoint[0] - from[0]) / DAY)) {
    out.push([Math.round((lastPoint[0] - from[0]) / DAY), lastPoint[1] / from[1]]);
  }
  return out;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
