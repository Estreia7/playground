import { isPairId, DEFAULT_PAIR } from "../../../fx/pairs.ts";
import { isTimeframeId, DEFAULT_TIMEFRAME } from "../../../fx/timeframes.ts";
import { readCandles } from "../storage.ts";

export const dynamic = "force-dynamic";

/* Candles come straight from the in-memory store. This route never calls a
   data provider: the scheduler owns the API budget, and a page refresh must
   not be able to spend it. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  const tf = url.searchParams.get("tf") ?? DEFAULT_TIMEFRAME;

  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });
  if (!isTimeframeId(tf)) return Response.json({ error: "Unknown timeframe." }, { status: 400 });

  const limitRaw = Number(url.searchParams.get("limit") ?? "1500");
  const limit = Number.isFinite(limitRaw) ? Math.min(5000, Math.max(50, limitRaw)) : 1500;

  const all = await readCandles(pair, tf);
  return Response.json({
    pair,
    tf,
    candles: all.slice(-limit),
    total: all.length,
  });
}
