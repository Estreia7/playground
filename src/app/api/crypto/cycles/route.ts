import { dailyHistory } from "../lib/history.ts";
import { usdtSymbols } from "../lib/binance.ts";
import { topCoins } from "../lib/coingecko.ts";
import { analyseCycles, relativePath, MIN_DAYS, MIN_DRAWDOWN, REBOUND, type Point } from "../engine/cycles.ts";
import type { CyclesPayload } from "../../../crypto/lib/types.ts";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Z0-9]{2,12}$/;
const MAX_POINTS = 1600;

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("asset") ?? "BTC").toUpperCase();
  if (!SYMBOL.test(symbol)) return Response.json({ error: "Unknown asset." }, { status: 400 });
  const pairs = await usdtSymbols().catch(() => null);
  if (pairs && !pairs.has(symbol + "USDT")) {
    return Response.json({ error: `${symbol} has no Binance history to analyse.` }, { status: 404 });
  }

  let rows;
  try {
    rows = await dailyHistory(symbol);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "History unavailable." }, { status: 502 });
  }
  const series: Point[] = rows.map((r) => [r[0], r[1]]);
  if (series.length < 30) return Response.json({ error: "Not enough history yet." }, { status: 422 });

  const analysis = analyseCycles(series);
  const lastBear = analysis.bears[analysis.bears.length - 1];

  // Thin the drawn series, but keep every turning point exactly.
  const keep = new Set<number>();
  for (const b of analysis.bears) [b.top, b.low].forEach((p) => keep.add(p[0]));
  for (const b of analysis.bulls) [b.low, b.top].forEach((p) => keep.add(p[0]));
  const step = Math.max(1, Math.ceil(series.length / MAX_POINTS));
  const thin = series.filter((p, i) => i % step === 0 || keep.has(p[0]) || i === series.length - 1);

  const names = await topCoins().catch(() => []);
  const name = names.find((c) => c.symbol.toUpperCase() === symbol)?.name ?? symbol;

  const payload: CyclesPayload = {
    symbol,
    name,
    from: series[0][0],
    price: series[series.length - 1],
    phase: analysis.phase,
    series: thin,
    bulls: analysis.bulls.map((b) => ({
      ...b,
      path: relativePath(series, b.low, b.current ? null : b.top),
    })),
    bears: analysis.bears.map((b) => {
      const current = b === lastBear && analysis.phase === "bear";
      return { ...b, current, path: relativePath(series, b.top, current ? null : b.low) };
    }),
    rules: { minDrawdown: MIN_DRAWDOWN, minDays: MIN_DAYS, rebound: REBOUND },
  };
  return Response.json(payload);
}
