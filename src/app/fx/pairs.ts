/* Pair registry. EUR/USD is the only pair enabled today, but every module
   downstream is keyed by `PairId`, so adding GBP/USD means one entry here
   plus a backfill — no code changes elsewhere. */

export type PairId = "EURUSD";

export interface Pair {
  id: PairId;
  label: string;
  /** Price move of one pip. 0.0001 for the majors, 0.01 for the JPY crosses. */
  pipSize: number;
  /** How many decimals the broker quotes (5 = fractional pip). */
  digits: number;
  /** USD value of one pip on one standard lot (100 000 units). For pairs
      quoted in USD this is exactly 10. */
  pipValuePerLotUsd: number;
  /** Typical retail spread, applied by the paper engine at fill time. */
  defaultSpreadPips: number;
  /** Provider symbols. */
  twelveData: string;
  dukascopy: string;
  tradingView: string;
}

export const PAIRS: Pair[] = [
  {
    id: "EURUSD",
    label: "EUR/USD",
    pipSize: 0.0001,
    digits: 5,
    pipValuePerLotUsd: 10,
    defaultSpreadPips: 0.8,
    twelveData: "EUR/USD",
    dukascopy: "eurusd",
    tradingView: "FX:EURUSD",
  },
];

const BY_ID = new Map(PAIRS.map((p) => [p.id, p]));

export function pair(id: PairId): Pair {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unknown pair: ${id}`);
  return p;
}

export function isPairId(value: unknown): value is PairId {
  return typeof value === "string" && BY_ID.has(value as PairId);
}

export const DEFAULT_PAIR: PairId = "EURUSD";
