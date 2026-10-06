import { flowSnapshot } from "../xrpl/collector.ts";
import { rebucket, WHALE_XRP } from "../engine/flow.ts";
import { klines } from "../lib/binance.ts";
import { memo } from "../lib/cache.ts";
import type { FlowPayload } from "../../../crypto/lib/types.ts";

export const dynamic = "force-dynamic";

const INTERVALS = {
  "1h": { seconds: 3600, bars: 24 * 14 },
  "4h": { seconds: 4 * 3600, bars: 6 * 90 },
  "1d": { seconds: 86400, bars: 400 },
} as const;

type IntervalId = keyof typeof INTERVALS;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("interval") ?? "1h";
  if (!(raw in INTERVALS)) return Response.json({ error: "Unknown interval." }, { status: 400 });
  const interval = raw as IntervalId;
  const { seconds, bars } = INTERVALS[interval];

  const { status, hourly } = await flowSnapshot();
  const from = Math.floor(Date.now() / 1000 / seconds) * seconds - (bars - 1) * seconds;
  const buckets = (interval === "1h" ? hourly : rebucket(hourly, seconds)).filter((b) => b.t >= from);

  const candles = await memo(
    "xrp-flow:candles:" + interval,
    60_000,
    async () => (await klines("XRPUSDT", interval, { limit: bars })).map((k) => [k[0], k[1], k[2], k[3], k[4]] as [number, number, number, number, number]),
    { stale: true }
  ).catch(() => []);

  const payload: FlowPayload = { status, whaleThreshold: WHALE_XRP, interval, buckets, candles };
  return Response.json(payload);
}
