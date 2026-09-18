import { DEFAULT_PAIR } from "../../../../fx/pairs.ts";
import { readCachedSetups } from "../../scan.ts";

export const dynamic = "force-dynamic";

// Next 16: params is a Promise and must be awaited.
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const setups = await readCachedSetups(DEFAULT_PAIR);
  const setup = setups.find((s) => s.id === id);
  if (!setup) return Response.json({ error: "That setup is no longer current." }, { status: 404 });
  return Response.json({ setup });
}
