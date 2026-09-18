import { DEFAULT_PAIR } from "../../../../../fx/pairs.ts";
import { cancelOrder, readState } from "../../store.ts";
import { requireAccess } from "../../../auth.ts";

export const dynamic = "force-dynamic";

// Next 16: params is a Promise and must be awaited.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const cancelled = await cancelOrder(id);
  if (!cancelled) {
    return Response.json({ error: "That order is not pending." }, { status: 404 });
  }
  return Response.json({ state: await readState(DEFAULT_PAIR) });
}
