import type { PairId } from "./pairs.ts";
import type { TimeframeId } from "./timeframes.ts";

/* Shared vocabulary for the FX Lab. Imported by both the server engine and
   the client views, so it must stay free of React and of node builtins. */

/** Candles travel as tuples, not objects: a 52 000-bar 5m file is ~2.6 MB as
    tuples against ~9 MB as `{time,open,...}`, and the wire format is the same
    shape the store keeps on disk. */
export type Candle = [time: number, open: number, high: number, low: number, close: number];

export const T = 0;
export const O = 1;
export const H = 2;
export const L = 3;
export const C = 4;

export type Direction = "long" | "short";

export type EvidenceKind = "candle" | "rsi" | "macd" | "htf" | "similarity" | "volatility";

export interface Evidence {
  kind: EvidenceKind;
  /** Short human label, e.g. "Bullish engulfing" or "RSI crossed out of 30". */
  name: string;
  direction: Direction | "neutral";
  /** Bar this evidence sits on, unix seconds. */
  barTime: number;
  /** 0..1 — how strong this instance is, used as a weight in the score. */
  strength: number;
  /** One sentence the UI shows on hover, in plain English. */
  detail?: string;
}

/** One historical window that resembles the present, plus what happened next. */
export interface Analog {
  /** Bar time of the LAST bar of the matched window. */
  barTime: number;
  /** Weighted euclidean distance; 0 is identical. */
  distance: number;
  /** Close-to-close move over the horizon, in pips (signed, direction-agnostic). */
  forwardPips: number;
  /** Max favourable / adverse excursion over the horizon, in pips, expressed
      for a LONG. The setup direction flips the sign when scoring. */
  mfePips: number;
  maePips: number;
  /** Did a 1xATR stop / 1.5xATR target trade win, evaluated first-touch? */
  outcome: "win" | "loss" | "open";
  /** Normalised close path of the window plus its forward bars, for the
      ghost line and the contact-sheet thumbnail. */
  shape: number[];
  forwardShape: number[];
}

export interface AnalogStats {
  count: number;
  /** Fraction 0..1 of analogs whose forward move went the setup's way. */
  winRate: number;
  /** Average signed pips in the setup's direction. */
  avgPips: number;
  medianPips: number;
  bestPips: number;
  worstPips: number;
  avgMfePips: number;
  avgMaePips: number;
  /** Win rate of ALL windows on this timeframe — the baseline the edge is
      measured against, so a 55% win rate in a market that drifts up 54% of
      the time reads as the nothing-burger it is. */
  baselineWinRate: number;
  /** Distribution of forward pips for the histogram, 9 buckets. */
  histogram: { from: number; to: number; count: number }[];
}

export interface ScoreComponent {
  key: "similarity" | "momentum" | "candle" | "htf" | "volatility";
  label: string;
  /** Points contributed, already weighted. */
  points: number;
  /** Maximum this component could contribute. */
  max: number;
  detail: string;
}

export interface Setup {
  id: string;
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  /** Bar the setup triggered on (the last closed bar at scan time). */
  barTime: number;
  /** Close of that bar. */
  price: number;
  score: number;
  components: ScoreComponent[];
  evidence: Evidence[];
  stats: AnalogStats | null;
  analogs: Analog[];
  suggested: {
    entry: number;
    stop: number;
    target: number;
    rr: number;
    stopPips: number;
    targetPips: number;
  };
  /** ATR(14) at the trigger bar, in price units — the paper ticket reuses it. */
  atr: number;
  createdAt: string;
}

export interface Alert {
  id: string;
  setupId: string;
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  score: number;
  barTime: number;
  price: number;
  headline: string;
  seen: boolean;
  createdAt: string;
}

/* ---- Paper trading ------------------------------------------------------ */

export type OrderType = "market" | "limit" | "stop";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export interface Order {
  id: string;
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  type: OrderType;
  /** Requested price; ignored for market orders. */
  price: number | null;
  lots: number;
  stop: number | null;
  target: number | null;
  status: OrderStatus;
  setupId: string | null;
  createdAt: string;
  /** Bar time the order was placed against, so fills never look backwards. */
  placedBar: number;
  filledAt?: string;
  fillPrice?: number;
  positionId?: string;
  note?: string;
}

export interface Position {
  id: string;
  orderId: string;
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  lots: number;
  entry: number;
  stop: number | null;
  target: number | null;
  openedAt: string;
  openedBar: number;
  setupId: string | null;
  /** Snapshot of why we took it — the analytics tab reads these, and they must
      not change when the setup list is recomputed. */
  entryScore: number | null;
  entryEvidence: string[];
  entryHtfAligned: boolean | null;
  /** Running excursions in pips, updated as bars arrive. */
  mfePips: number;
  maePips: number;
  note?: string;
}

export type ExitReason = "stop" | "target" | "manual" | "reset";

export interface Trade {
  id: string;
  positionId: string;
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  lots: number;
  entry: number;
  exit: number;
  stop: number | null;
  target: number | null;
  openedAt: string;
  closedAt: string;
  openedBar: number;
  closedBar: number;
  pips: number;
  usd: number;
  /** Result in R multiples; null when the trade had no stop. */
  r: number | null;
  mfePips: number;
  maePips: number;
  exitReason: ExitReason;
  setupId: string | null;
  entryScore: number | null;
  entryEvidence: string[];
  entryHtfAligned: boolean | null;
  /** Hour of entry in UTC and the session it belongs to. */
  entryHourUtc: number;
  session: "sydney" | "tokyo" | "london" | "newyork" | "overlap";
  weekday: number;
  /** User post-mortem. */
  tags: string[];
  note: string;
}

export interface Account {
  startingBalance: number;
  balance: number;
  /** Cash + unrealised P&L of open positions. */
  equity: number;
  leverage: number;
  createdAt: string;
  resetAt: string | null;
}
