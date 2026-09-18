import { DEFAULT_PAIR, isPairId } from "../../../fx/pairs.ts";
import { tick } from "../scheduler.ts";
import { runScan } from "../scan.ts";
import { requireAccess } from "../auth.ts";

export const dynamic = "force-dynamic";

/* Run a cycle by hand.

   `live` also spends an API credit to refresh the candles; without it the scan
   re-runs the analysis over the data already on disk, which is what you want
   after changing a setting. */
export async function POST(request: Request) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }

  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });

  const live = url.searchParams.get("live") === "1";

  if (live) {
    const result = await tick(pair, true);
    return Response.json({ mode: "live", result });
  }

  const result = await runScan(pair, true);
  return Response.json({
    mode: "recompute",
    result: { ...result, setups: result.setups.map((s) => ({ ...s, analogs: [] })) },
  });
}
