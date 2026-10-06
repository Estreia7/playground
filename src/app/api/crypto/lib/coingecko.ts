import { fetchJson, memo } from "./cache.ts";

/* CoinGecko's free public API, used for what Binance does not have: market
   cap rank, logos, circulating supply and the whole-market totals.

   The keyless tier allows a handful of calls a minute, so everything here is
   cached for a minute or more and served stale if a refresh is refused. */

const BASE = "https://api.coingecko.com/api/v3";

export interface GeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] } | null;
  ath: number | null;
  ath_change_percentage: number | null;
}

export function topCoins(): Promise<GeckoCoin[]> {
  return memo(
    "gecko:top",
    90_000,
    async () => {
      const params = new URLSearchParams({
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: "150",
        page: "1",
        sparkline: "true",
        price_change_percentage: "1h,24h,7d",
      });
      return fetchJson<GeckoCoin[]>(`${BASE}/coins/markets?${params}`);
    },
    { stale: true }
  );
}

export interface GeckoGlobal {
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
}

export function globalStats(): Promise<GeckoGlobal> {
  return memo(
    "gecko:global",
    120_000,
    async () => (await fetchJson<{ data: GeckoGlobal }>(`${BASE}/global`)).data,
    { stale: true }
  );
}

/** Stablecoins, gold tokens and wrapped or staked copies of other coins.
    They are listed on CoinGecko by market cap but carry no signal of their
    own, and counting a dozen dollar tokens would drag every market average
    towards neutral. */
const EXCLUDED = new Set([
  "usdt", "usdc", "dai", "fdusd", "tusd", "usde", "usdd", "pyusd", "usds", "usd1", "frax", "busd",
  "rlusd", "usdtb", "bfusd", "usdf", "gusd", "usdp", "eurc", "usdx", "susde", "susds", "usdy", "usyc",
  "buidl", "usdg", "usd0", "lisusd", "crvusd", "gho", "paxg", "xaut", "wbtc", "weth", "steth",
  "wsteth", "weeth", "wbeth", "cbbtc", "reth", "meth", "rseth", "ezeth", "lbtc", "solvbtc", "bnsol",
  "jitosol", "msol", "kau", "kag", "a7a5", "figr_heloc", "jupsol", "cmeth", "clbtc", "tbtc", "ebtc", "stkaave", "oseth", "sweth",
]);

export function isExcluded(c: GeckoCoin): boolean {
  if (EXCLUDED.has(c.symbol.toLowerCase())) return true;
  if (/^(wrapped|bridged|staked) /i.test(c.name)) return true;
  // Tokenised funds and real-world assets: T-bills, money-market and swap
  // funds, home-equity loans, gold.
  if (/\b(fund|t-bills?|treasury|money market|heloc|gold)\b/i.test(c.name)) return true;
  // Anything pinned to a dollar we have not listed by name.
  const p = c.current_price ?? 0;
  const week = Math.abs(c.price_change_percentage_7d_in_currency ?? 99);
  if (p > 0.97 && p < 1.03 && week < 1) return true;
  // Tokenised funds, loans and other-currency stables (HELOC pools, T-bill
  // funds, gold, rouble and euro tokens) barely move: a week inside a 1%
  // range is not a market anyone reads RSI on.
  const spark = c.sparkline_in_7d?.price ?? [];
  if (spark.length > 24) {
    const lo = Math.min(...spark);
    const hi = Math.max(...spark);
    if (lo > 0 && (hi - lo) / lo < 0.01) return true;
  }
  return false;
}
