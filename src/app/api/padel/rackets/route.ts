import { seasonRackets } from "./store.ts";
import { seasonsFor } from "../../../padel/rackets/catalog.ts";

export const dynamic = "force-dynamic";

/* GET /api/padel/rackets?season=2025 — a season's rackets from Padelful, each
   with the prices this server has recorded for it month by month. */

export async function GET(request: Request) {
  const season = Number(new URL(request.url).searchParams.get("season"));
  if (!seasonsFor(new Date()).includes(season)) return Response.json({ error: "badRequest" }, { status: 400 });
  try {
    return Response.json(await seasonRackets(season), { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    console.error("Padelful error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "padelful" }, { status: 502 });
  }
}
