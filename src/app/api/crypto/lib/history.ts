import { fetchJson, memo, readJson, writeJson } from "./cache.ts";
import { dailySince, usdtSymbols } from "./binance.ts";

/* Long daily history per coin, for the cycle and NUPL pages.

   Binance has daily candles from each pair's listing (BTC and ETH from
   August 2017). Bitcoin's earlier years come from blockchain.com's market
   price series, which goes back to 2010; the two are joined where Binance
   starts, so the cycle page can show all five Bitcoin cycles.

   Stored as storage/crypto/history/<SYM>.json and topped up from the last
   stored day, so after the first load each refresh is one small request.
   The last row is today's candle, still forming. */

/** [day (unix s, UTC midnight), close, base volume, quote volume] */
export type DayRow = [number, number, number, number];

const DAY = 86400;

async function bitcoinBefore(t: number): Promise<DayRow[]> {
  const res = await fetchJson<{ values: { x: number; y: number }[] }>(
    "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false",
    { timeoutMs: 40_000 }
  );
  return res.values
    .filter((v) => v.y > 0 && v.x < t)
    .map((v) => [Math.floor(v.x / DAY) * DAY, v.y, 0, 0] as DayRow);
}

async function load(symbol: string): Promise<DayRow[]> {
  const pair = symbol + "USDT";
  const pairs = await usdtSymbols();
  if (!pairs.has(pair)) throw new Error(`No Binance USDT market for ${symbol}`);

  const file = `history/${symbol}.json`;
  const stored = (await readJson<DayRow[]>(file)) ?? [];
  // Re-fetch from the last stored day: it was still forming when saved.
  const since = stored.length ? stored[stored.length - 1][0] : 0;
  const fresh = await dailySince(pair, since);
  const rows: DayRow[] = stored.filter((r) => r[0] < since);
  for (const k of fresh) rows.push([k[0], k[4], k[5], k[6]]);

  // Bitcoin's first row is a Binance candle (it has volume) only until the
  // early years have been joined on; join them once.
  if (symbol === "BTC" && rows.length && rows[0][3] > 0) {
    const early = await bitcoinBefore(rows[0][0]).catch(() => [] as DayRow[]);
    rows.unshift(...early);
  }

  await writeJson(file, rows);
  return rows;
}

/** Daily history for a coin by its ticker ("BTC"). Refreshed at most every
    ten minutes; the in-progress day moves in between. */
export function dailyHistory(symbol: string): Promise<DayRow[]> {
  return memo(`history:${symbol}`, 10 * 60_000, () => load(symbol), { stale: true });
}
