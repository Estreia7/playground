import type { FlowBucket } from "../../../crypto/lib/types.ts";

/* XRP exchange flow accounting.

   A payment from a non-exchange account into an exchange is an inflow
   (coins arriving to be sold, usually); the reverse is an outflow (coins
   leaving for self-custody). Transfers between two exchange accounts, or
   between two outside accounts, are neither. Payments of WHALE_XRP or more
   are counted separately, so the page can say whether large holders or the
   crowd are driving the flow. */

export const WHALE_XRP = 1_000_000;

export interface FlowPayment {
  from: string;
  to: string;
  /** Delivered amount in XRP. */
  xrp: number;
  /** Unix seconds. */
  time: number;
}

export type Direction = "in" | "out" | null;

export function directionOf(p: FlowPayment, exchanges: ReadonlyMap<string, string>): Direction {
  const fromExchange = exchanges.has(p.from);
  const toExchange = exchanges.has(p.to);
  if (toExchange && !fromExchange) return "in";
  if (fromExchange && !toExchange) return "out";
  return null;
}

const HOUR = 3600;

export function hourOf(time: number): number {
  return Math.floor(time / HOUR) * HOUR;
}

export function emptyBucket(t: number): FlowBucket {
  return { t, inWhale: 0, inSmall: 0, outWhale: 0, outSmall: 0, count: 0 };
}

/** Add a payment to its hourly bucket. Returns false when it is not a flow. */
export function addPayment(
  buckets: Map<number, FlowBucket>,
  p: FlowPayment,
  exchanges: ReadonlyMap<string, string>,
  whale = WHALE_XRP
): boolean {
  const dir = directionOf(p, exchanges);
  if (!dir || !(p.xrp > 0)) return false;
  const t = hourOf(p.time);
  const b = buckets.get(t) ?? emptyBucket(t);
  const big = p.xrp >= whale;
  if (dir === "in") {
    if (big) b.inWhale += p.xrp;
    else b.inSmall += p.xrp;
  } else if (big) b.outWhale += p.xrp;
  else b.outSmall += p.xrp;
  b.count++;
  buckets.set(t, b);
  return true;
}

export function mergeBuckets(into: Map<number, FlowBucket>, from: Iterable<FlowBucket>): void {
  for (const b of from) {
    const cur = into.get(b.t) ?? emptyBucket(b.t);
    cur.inWhale += b.inWhale;
    cur.inSmall += b.inSmall;
    cur.outWhale += b.outWhale;
    cur.outSmall += b.outSmall;
    cur.count += b.count;
    into.set(b.t, cur);
  }
}

/** Re-bucket hourly buckets into wider ones (4h or 1d, UTC-aligned). */
export function rebucket(hourly: FlowBucket[], seconds: number): FlowBucket[] {
  const out = new Map<number, FlowBucket>();
  for (const b of hourly) {
    const t = Math.floor(b.t / seconds) * seconds;
    mergeBuckets(out, [{ ...b, t }]);
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

export interface FlowSummary {
  inflow: number;
  outflow: number;
  net: number;
  whaleNet: number;
  smallNet: number;
  signal: "net-inflow" | "net-outflow" | "balanced";
  dominance: "whale-deposits" | "whale-withdrawals" | "small-deposits" | "small-withdrawals" | "none";
}

export function summarise(buckets: FlowBucket[]): FlowSummary {
  let inW = 0, inS = 0, outW = 0, outS = 0;
  for (const b of buckets) {
    inW += b.inWhale;
    inS += b.inSmall;
    outW += b.outWhale;
    outS += b.outSmall;
  }
  const inflow = inW + inS;
  const outflow = outW + outS;
  const net = inflow - outflow;
  const whaleNet = inW - outW;
  const smallNet = inS - outS;
  const total = inflow + outflow;
  // Within half a percent of the traffic counts as balanced.
  const signal = total === 0 || Math.abs(net) < total * 0.005 ? "balanced" : net > 0 ? "net-inflow" : "net-outflow";
  let dominance: FlowSummary["dominance"] = "none";
  if (whaleNet !== 0 || smallNet !== 0) {
    if (Math.abs(whaleNet) >= Math.abs(smallNet)) dominance = whaleNet > 0 ? "whale-deposits" : "whale-withdrawals";
    else dominance = smallNet > 0 ? "small-deposits" : "small-withdrawals";
  }
  return { inflow, outflow, net, whaleNet, smallNet, signal, dominance };
}
