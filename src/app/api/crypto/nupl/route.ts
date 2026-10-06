import { dailyHistory } from "../lib/history.ts";
import { usdtSymbols } from "../lib/binance.ts";
import { topCoins } from "../lib/coingecko.ts";
import { estimateNupl, TURNOVER, type VolumeDay } from "../engine/nupl.ts";
import type { NuplPayload } from "../../../crypto/lib/types.ts";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Z0-9]{2,12}$/;

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("asset") ?? "XRP").toUpperCase();
  if (!SYMBOL.test(symbol)) return Response.json({ error: "Unknown asset." }, { status: 400 });
  const pairs = await usdtSymbols().catch(() => null);
  if (pairs && !pairs.has(symbol + "USDT")) {
    return Response.json({ error: `${symbol} has no Binance history.` }, { status: 404 });
  }

  const coins = await topCoins().catch(() => []);
  const coin = coins.find((c) => c.symbol.toUpperCase() === symbol);
  const supply = coin?.circulating_supply ?? 0;
  if (!supply) return Response.json({ error: `No circulating supply known for ${symbol}.` }, { status: 404 });

  let rows;
  try {
    rows = await dailyHistory(symbol);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "History unavailable." }, { status: 502 });
  }
  // Only days with Binance volume: Bitcoin's pre-2017 rows have none.
  const days: VolumeDay[] = rows.filter((r) => r[2] > 0);

  const { points, settled } = estimateNupl(days, supply);
  const payload: NuplPayload = {
    symbol,
    name: coin?.name ?? symbol,
    points: points.slice(settled),
    historyFrom: days[0]?.[0] ?? null,
    supply,
    turnover: TURNOVER,
  };
  return Response.json(payload);
}
