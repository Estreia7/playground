import { fetchJson, mapLimit, memo } from "./cache.ts";
import { klines, usdtSymbols } from "./binance.ts";
import { globalStats, isExcluded, topCoins, type GeckoCoin } from "./coingecko.ts";
import { marketSummary, signalsOf, zoneOf, type Bms, type DailyClose, type Zone } from "../engine/signals.ts";
import type { MarketsPayload, MarketRow } from "../../../crypto/lib/types.ts";

/* The overview's data: CoinGecko's top coins merged with signals computed
   from each coin's Binance daily candles.

   Signals need about 400 days per coin, one request each, so they are
   computed for the whole list at once every fifteen minutes and served stale
   while the next batch runs. Prices and market caps refresh every 90 s. */

const TABLE_SIZE = 100;

interface SignalSet {
  micro: number | null;
  macro: number | null;
  bms: Bms | null;
  microYesterday: number | null;
  macroYesterday: number | null;
}

async function signalsFor(symbols: string[]): Promise<Record<string, SignalSet>> {
  const pairs = await usdtSymbols();
  const out: Record<string, SignalSet> = {};
  await mapLimit(symbols, 6, async (sym) => {
    if (!pairs.has(sym + "USDT")) return;
    try {
      const rows = await klines(sym + "USDT", "1d", { limit: 420 });
      const daily: DailyClose[] = rows.map((k) => [k[0], k[4]]);
      const now = signalsOf(daily);
      const before = signalsOf(daily.slice(0, -1));
      out[sym] = { ...now, microYesterday: before.micro, macroYesterday: before.macro };
    } catch {
      // One coin failing leaves its signal cells empty; the table still loads.
    }
  });
  return out;
}

function tradingViewSymbol(sym: string, onBinance: boolean): string {
  // TradingView's CRYPTO: prefix is its own cross-exchange index, which
  // covers most coins Binance does not list.
  return onBinance ? `BINANCE:${sym}USDT` : `CRYPTO:${sym}USD`;
}

async function fearAndGreed(): Promise<{ value: number; label: string } | null> {
  return memo(
    "fng",
    30 * 60_000,
    async () => {
      const res = await fetchJson<{ data: { value: string; value_classification: string }[] }>(
        "https://api.alternative.me/fng/?limit=1"
      );
      const d = res.data?.[0];
      return d ? { value: Number(d.value), label: d.value_classification } : null;
    },
    { stale: true }
  ).catch(() => null);
}

export async function marketsPayload(): Promise<MarketsPayload> {
  const [coins, pairs] = await Promise.all([topCoins(), usdtSymbols()]);
  const listed: GeckoCoin[] = coins.filter((c) => !isExcluded(c)).slice(0, TABLE_SIZE);
  const symbols = listed.map((c) => c.symbol.toUpperCase());

  // Keyed on the symbol list so a reshuffled top 100 gets its new coins.
  const signals = await memo("signals:" + [...symbols].sort().join(","), 15 * 60_000, () => signalsFor(symbols), {
    stale: true,
  }).catch(() => ({}) as Record<string, SignalSet>);

  const rows: MarketRow[] = listed.map((c) => {
    const sym = c.symbol.toUpperCase();
    const s = signals[sym];
    const onBinance = pairs.has(sym + "USDT");
    const spark = c.sparkline_in_7d?.price ?? [];
    return {
      id: c.id,
      symbol: sym,
      name: c.name,
      image: c.image,
      rank: c.market_cap_rank,
      price: c.current_price,
      marketCap: c.market_cap,
      volume: c.total_volume,
      change1h: c.price_change_percentage_1h_in_currency ?? null,
      change24h: c.price_change_percentage_24h_in_currency ?? null,
      change7d: c.price_change_percentage_7d_in_currency ?? null,
      spark: spark.slice(-25),
      binance: onBinance,
      tradingView: tradingViewSymbol(sym, onBinance),
      micro: s?.micro ?? null,
      microZone: s?.micro != null ? zoneOf(s.micro) : null,
      macro: s?.macro ?? null,
      macroZone: s?.macro != null ? zoneOf(s.macro) : null,
      bms: s?.bms ?? null,
    };
  });

  const pick = (k: keyof SignalSet) => symbols.map((sym) => (signals[sym]?.[k] as number | null | undefined) ?? null);
  const micro = marketSummary(pick("micro"));
  const microYesterday = marketSummary(pick("microYesterday"));
  const macro = marketSummary(pick("macro"));

  const [global, fng] = await Promise.all([globalStats().catch(() => null), fearAndGreed()]);

  return {
    updatedAt: Math.floor(Date.now() / 1000),
    coins: rows,
    micro: { level: micro.level, zones: micro.zones, yesterday: microYesterday.zones, counted: micro.counted },
    macro: { level: macro.level, counted: macro.counted },
    global: global
      ? {
          marketCap: global.total_market_cap.usd ?? null,
          volume: global.total_volume.usd ?? null,
          change24h: global.market_cap_change_percentage_24h_usd ?? null,
          btcDominance: global.market_cap_percentage.btc ?? null,
          ethDominance: global.market_cap_percentage.eth ?? null,
          usdtDominance: global.market_cap_percentage.usdt ?? null,
        }
      : null,
    fearGreed: fng,
  };
}


export type { Zone };
