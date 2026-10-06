/* Net Unrealized Profit/Loss, estimated from trading volume.

   Real NUPL compares market value with realized value — what every coin was
   worth when it last moved on-chain. That needs a chain index, which no free
   service offers for XRP or most other coins. This estimate rebuilds a cost
   basis from exchange volume instead:

     each day, a fraction f of the supply changes hands at that day's average
     price, so   costBasis = costBasis × (1 − f) + vwap × f,
     with        f = TURNOVER × volume / circulating supply.

   Exchange volume counts the same coins changing hands many times, so only a
   share of it (TURNOVER) is treated as coins really changing owner. The value
   0.4 was chosen against published XRP readings for 2024–2026; it is an
   estimate and the page says so.

   NUPL = 1 − costBasis / price, and MVRV = price / costBasis.

   The model has to start from some cost basis, and the first day's price is
   all there is; for a coin listed mid-crash that guess is badly off and fades
   only as volume replaces it. `settled` is the first day on which less than
   SETTLED_SEED of the cost basis still comes from that guess, and the page
   draws from there. */

export const TURNOVER = 0.4;
export const SETTLED_SEED = 0.25;

/** [day, close, base volume, quote volume] */
export type VolumeDay = [number, number, number, number];

export function estimateNupl(
  rows: VolumeDay[],
  supply: number,
  turnover = TURNOVER
): { points: [number, number, number, number][]; settled: number } {
  const out: [number, number, number, number][] = [];
  let cost = Number.NaN;
  let seed = 1;
  let settled = -1;
  for (const [t, close, base, quote] of rows) {
    if (!(close > 0)) continue;
    const vwap = base > 0 ? quote / base : close;
    if (!Number.isFinite(cost)) cost = vwap;
    else {
      const f = supply > 0 ? Math.min(1, (turnover * base) / supply) : 0;
      cost = cost * (1 - f) + vwap * f;
      seed *= 1 - f;
    }
    out.push([t, close, 1 - cost / close, cost]);
    if (settled < 0 && seed < SETTLED_SEED) settled = out.length - 1;
  }
  // Never settles (a young coin with little volume): show it all, flagged.
  return { points: out, settled: settled < 0 ? 0 : settled };
}

export interface NuplBand {
  key: "capitulation" | "hope" | "optimism" | "belief" | "euphoria";
  label: string;
  from: number;
  to: number;
}

/** The classic NUPL sentiment bands. */
export const NUPL_BANDS: NuplBand[] = [
  { key: "capitulation", label: "Capitulation", from: -Infinity, to: -0.25 },
  { key: "hope", label: "Hope – Fear", from: -0.25, to: 0 },
  { key: "optimism", label: "Optimism – Anxiety", from: 0, to: 0.25 },
  { key: "belief", label: "Belief – Denial", from: 0.25, to: 0.5 },
  { key: "euphoria", label: "Euphoria – Greed", from: 0.5, to: Infinity },
];

export function nuplBand(value: number): NuplBand {
  return NUPL_BANDS.find((b) => value >= b.from && value < b.to) ?? NUPL_BANDS[0];
}

export function profitLabel(value: number): string {
  if (value < -0.25) return "Deep loss";
  if (value < 0) return "Unrealized loss";
  if (value < 0.1) return "Limited profit";
  if (value < 0.35) return "Healthy profit";
  return "Large profit";
}
