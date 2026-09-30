import { recommendations } from "../padelful.ts";
import { priceHistory } from "../store.ts";
import { normalize, type Racket } from "../../../../padel/rackets/catalog.ts";

export const dynamic = "force-dynamic";

/* POST /api/padel/rackets/recommend  { level, playStyle, budget? }

   Padelful's get_recommendations tool, through its MCP server. The answers
   depend only on the three inputs, so each combination is kept for a day. */

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const STYLES = ["control", "balanced", "power"] as const;
const TTL = 24 * 3600_000;

const cache = new Map<string, { at: number; rackets: Racket[] }>();

export async function POST(request: Request) {
  let body: { level?: unknown; playStyle?: unknown; budget?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  const level = LEVELS.find((l) => l === body.level);
  const playStyle = STYLES.find((s) => s === body.playStyle);
  const budget = typeof body.budget === "number" && body.budget >= 30 && body.budget <= 1000 ? Math.round(body.budget) : undefined;
  if (!level || !playStyle) return Response.json({ error: "badRequest" }, { status: 400 });

  const key = `${level}|${playStyle}|${budget ?? ""}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL) {
    try {
      const raw = await recommendations({ level, playStyle, budget });
      hit = { at: Date.now(), rackets: raw.map(normalize).filter((r): r is Racket => r !== null) };
      cache.set(key, hit);
    } catch (err: unknown) {
      console.error("Padelful recommend error:", err instanceof Error ? err.message : err);
      if (!hit) return Response.json({ error: "padelful" }, { status: 502 });
    }
  }
  const history = await priceHistory(hit.rackets.map((r) => r.slug));
  return Response.json(
    { rackets: hit.rackets.map((r) => ({ ...r, history: history.get(r.slug) ?? [] })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
