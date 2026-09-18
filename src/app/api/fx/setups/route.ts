import { isPairId, DEFAULT_PAIR } from "../../../fx/pairs.ts";
import { isTimeframeId } from "../../../fx/timeframes.ts";
import { readCachedSetups } from "../scan.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  const tf = url.searchParams.get("tf");

  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });
  if (tf !== null && !isTimeframeId(tf)) {
    return Response.json({ error: "Unknown timeframe." }, { status: 400 });
  }

  const setups = await readCachedSetups(pair, tf ?? undefined);
  // The analog list is large and only the detail view needs it.
  const light = setups.map((s) => ({ ...s, analogs: [] }));
  return Response.json({ setups: light });
}
