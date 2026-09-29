import { applyAction, readClub } from "./store";
import type { Action } from "../../padel/core/actions.ts";

export async function GET() {
  return Response.json({ club: await readClub() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let action: Action;
  try {
    action = (await request.json()) as Action;
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  try {
    const result = await applyAction(action);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ club: result.club, id: result.id });
  } catch (err: unknown) {
    console.error("Padel save error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
