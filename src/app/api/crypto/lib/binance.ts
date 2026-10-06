import { fetchJson, memo } from "./cache.ts";

/* Binance public market data.

   data-api.binance.vision is Binance's market-data-only mirror: no key, no
   account endpoints, and it answers from regions where api.binance.com is
   blocked, which keeps the VPS out of geo-fencing trouble. */

const BASE = "https://data-api.binance.vision/api/v3";

/** [openTime (unix s), open, high, low, close, baseVolume, quoteVolume] */
export type Kline = [number, number, number, number, number, number, number];

type RawKline = [number, string, string, string, string, string, number, string, ...unknown[]];

export type Interval = "1h" | "4h" | "1d" | "1w";

export async function klines(
  symbol: string,
  interval: Interval,
  opts: { startTime?: number; limit?: number } = {}
): Promise<Kline[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.startTime !== undefined) params.set("startTime", String(opts.startTime * 1000));
  const raw = await fetchJson<RawKline[]>(`${BASE}/klines?${params}`);
  return raw.map((k) => [Math.floor(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5], +k[7]]);
}

/** Every daily candle since `since` (unix s), paging 1000 at a time. */
export async function dailySince(symbol: string, since: number): Promise<Kline[]> {
  const out: Kline[] = [];
  let start = since;
  for (let page = 0; page < 20; page++) {
    const batch = await klines(symbol, "1d", { startTime: start, limit: 1000 });
    if (!batch.length) break;
    out.push(...batch);
    start = batch[batch.length - 1][0] + 86400;
    if (batch.length < 1000) break;
  }
  return out;
}

/** The set of symbols Binance trades against USDT, e.g. "BTCUSDT". */
export function usdtSymbols(): Promise<Set<string>> {
  return memo("binance:symbols", 6 * 3600_000, async () => {
    const rows = await fetchJson<{ symbol: string }[]>(`${BASE}/ticker/price`);
    return new Set(rows.map((r) => r.symbol).filter((s) => s.endsWith("USDT")));
  });
}
