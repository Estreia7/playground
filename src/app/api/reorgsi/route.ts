import { applyAction, readDb } from "./store.ts";
import { requireAccess, unauthorized } from "./auth.ts";
import type { Action } from "../../reorgsi/core/actions.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAccess(request))) return unauthorized();
  return Response.json({ db: await readDb() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await requireAccess(request))) return unauthorized();
  let action: Action;
  try {
    action = (await request.json()) as Action;
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  try {
    const result = await applyAction(action);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ db: result.db, id: result.id });
  } catch (err: unknown) {
    console.error("ReorgSI save error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
