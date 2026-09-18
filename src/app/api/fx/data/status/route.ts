import { DEFAULT_PAIR, isPairId } from "../../../../fx/pairs.ts";
import { allTimeframeStatus } from "../../storage.ts";
import { budgetStatus } from "../../providers/budget.ts";
import { hasApiKey } from "../../providers/twelvedata.ts";
import { readSchedulerState, marketIsOpen } from "../../scheduler.ts";
import { activeJobs } from "../../backfill/route.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });

  const [timeframes, budget, scheduler] = await Promise.all([
    allTimeframeStatus(pair),
    budgetStatus(),
    readSchedulerState(),
  ]);

  return Response.json({
    pair,
    timeframes,
    budget,
    scheduler: { ...scheduler, marketOpen: marketIsOpen(), hasApiKey: hasApiKey() },
    jobs: activeJobs(),
  });
}
