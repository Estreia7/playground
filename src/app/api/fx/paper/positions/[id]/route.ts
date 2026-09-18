import { DEFAULT_PAIR } from "../../../../../fx/pairs.ts";
import { closeNow, readState } from "../../store.ts";
import { requireAccess } from "../../../auth.ts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const trade = await closeNow(DEFAULT_PAIR, id);
  if (!trade) {
    return Response.json({ error: "That position is not open." }, { status: 404 });
  }
  return Response.json({ trade, state: await readState(DEFAULT_PAIR) });
}
