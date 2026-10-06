/* Payload shapes shared by the crypto API routes and the pages that read
   them. Type-only, so importing it from either side costs nothing. */

export type Zone = "buy" | "buy-warning" | "neutral" | "sell-warning" | "sell";
export type BmsState = "strong-bull" | "mild-bull" | "in-band" | "mild-bear" | "strong-bear";

export interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  rank: number | null;
  price: number | null;
  marketCap: number | null;
  volume: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  /** Hourly prices for the last day, oldest first. */
  spark: number[];
  binance: boolean;
  tradingView: string;
  micro: number | null;
  microZone: Zone | null;
  macro: number | null;
  macroZone: Zone | null;
  bms: { state: BmsState; distance: number; level: number } | null;
}

export interface MarketsPayload {
  updatedAt: number;
  coins: MarketRow[];
  micro: {
    level: number | null;
    zones: { zone: Zone; share: number }[];
    yesterday: { zone: Zone; share: number }[];
    counted: number;
  };
  macro: { level: number | null; counted: number };
  global: {
    marketCap: number | null;
    volume: number | null;
    change24h: number | null;
    btcDominance: number | null;
    ethDominance: number | null;
    usdtDominance: number | null;
  } | null;
  fearGreed: { value: number; label: string } | null;
}

export type PricePoint = [t: number, price: number];

export interface CycleBull {
  low: PricePoint;
  top: PricePoint;
  multiple: number;
  days: number;
  current: boolean;
  /** [days since the low, price / low price] */
  path: [number, number][];
}

export interface CycleBear {
  top: PricePoint;
  low: PricePoint;
  recovered: PricePoint | null;
  drawdown: number;
  days: number;
  current: boolean;
  /** [days since the top, price / top price] */
  path: [number, number][];
}

export interface CyclesPayload {
  symbol: string;
  name: string;
  from: number;
  price: PricePoint;
  phase: "bull" | "bear";
  /** Daily closes, thinned for drawing. */
  series: PricePoint[];
  bulls: CycleBull[];
  bears: CycleBear[];
  rules: { minDrawdown: number; minDays: number; rebound: number };
}

export interface StadPayload {
  updatedAt: number;
  /** [day, STH-SOPR, BTC close] */
  points: [number, number, number | null][];
  upper: number;
  lower: number;
  /** Days of delay on the free feed. */
  lagDays: number;
}

export interface NuplPayload {
  symbol: string;
  name: string;
  /** [day, close, NUPL, cost basis] */
  points: [number, number, number, number][];
  /** First day of Binance history; points start later, once the estimate settles. */
  historyFrom: number | null;
  supply: number;
  turnover: number;
}

export interface FlowBucket {
  /** Bucket start, unix s. */
  t: number;
  inWhale: number;
  inSmall: number;
  outWhale: number;
  outSmall: number;
  count: number;
}

export interface FlowPayload {
  status: {
    running: boolean;
    connected: boolean;
    since: number | null;
    lastLedger: number | null;
    backfilling: boolean;
    exchanges: number;
    accounts: number;
    message: string | null;
  };
  whaleThreshold: number;
  interval: "1h" | "4h" | "1d";
  buckets: FlowBucket[];
  /** XRP/USDT candles for the same span: [t, o, h, l, c] */
  candles: [number, number, number, number, number][];
}
