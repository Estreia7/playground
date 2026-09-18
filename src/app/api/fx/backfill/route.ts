import { DEFAULT_PAIR, isPairId, type PairId } from "../../../fx/pairs.ts";
import { isTimeframeId, timeframe, type TimeframeId } from "../../../fx/timeframes.ts";
import { backfill, type BackfillProgress } from "../providers/dukascopy.ts";
import { writeCandles } from "../storage.ts";
import { requireAccess } from "../auth.ts";

export const dynamic = "force-dynamic";

/* Backfills run for minutes, far longer than a request should.

   The job is started here and tracked on globalThis; the client polls
   /api/fx/data/status for progress. Under `next start` the server is one
   long-lived process, so a promise that outlives its request is safe — there
   is no serverless freeze to worry about. */

export interface BackfillJob {
  pair: PairId;
  tf: TimeframeId;
  years: number;
  startedAt: string;
  finishedAt: string | null;
  progress: BackfillProgress;
  error: string | null;
}

const GLOBAL_KEY = Symbol.for("playground.fx.backfill");

function jobs(): Map<string, BackfillJob> {
  const holder = globalThis as unknown as Record<symbol, Map<string, BackfillJob> | undefined>;
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = new Map();
  return holder[GLOBAL_KEY];
}

export function activeJobs(): BackfillJob[] {
  return [...jobs().values()];
}

export async function POST(request: Request) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { tf, years } = body as { tf?: unknown; years?: unknown };
  const pair = DEFAULT_PAIR;

  if (!isTimeframeId(tf)) return Response.json({ error: "Unknown timeframe." }, { status: 400 });
  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });

  const requestedYears =
    typeof years === "number" && Number.isFinite(years) && years > 0 && years <= 25
      ? years
      : timeframe(tf).backfillYears;

  const key = pair + ":" + tf;
  const running = jobs().get(key);
  if (running && running.finishedAt === null) {
    return Response.json({ error: "That timeframe is already downloading.", job: running }, { status: 409 });
  }

  const job: BackfillJob = {
    pair,
    tf,
    years: requestedYears,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: { done: 0, total: 0, bars: 0, current: null },
    error: null,
  };
  jobs().set(key, job);

  const to = new Date();
  const from = new Date(to.getTime() - requestedYears * 365.25 * 24 * 60 * 60 * 1000);

  // Fire and forget: the response returns immediately with the job handle.
  void backfill(pair, tf, {
    from,
    to,
    onProgress: (progress) => {
      job.progress = progress;
    },
  })
    .then(async (candles) => {
      await writeCandles(pair, tf, candles);
      job.finishedAt = new Date().toISOString();
    })
    .catch((error) => {
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
    });

  return Response.json({ job });
}
