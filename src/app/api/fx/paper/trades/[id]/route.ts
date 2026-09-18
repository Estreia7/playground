import { tagTrade } from "../../store.ts";
import { requireAccess } from "../../../auth.ts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Attach a post-mortem to a closed trade. */
export async function PATCH(request: Request, ctx: Ctx) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const b = body as { tags?: unknown; note?: unknown };
  const tags = Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === "string") : [];
  const note = typeof b.note === "string" ? b.note : "";

  const trade = await tagTrade(id, tags, note);
  if (!trade) return Response.json({ error: "No such trade." }, { status: 404 });
  return Response.json({ trade });
}
