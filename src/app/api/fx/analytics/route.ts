import { DEFAULT_PAIR, isPairId } from "../../../fx/pairs.ts";
import { readState } from "../paper/store.ts";
import { analyse } from "../paper/analytics.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });

  const state = await readState(pair);
  return Response.json({
    analytics: analyse(state.trades, state.account.startingBalance),
    openPositions: state.positions.length,
  });
}
