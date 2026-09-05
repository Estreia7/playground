import { isEconId, readEcon } from "../read";

export const dynamic = "force-dynamic";

// Next 16: params is a Promise and must be awaited.
type Ctx = { params: Promise<{ dataset: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { dataset } = await ctx.params;
  if (!isEconId(dataset)) {
    return Response.json({ error: "Conjunto de dados desconhecido" }, { status: 404 });
  }
  const data = await readEcon(dataset);
  if (!data) {
    return Response.json({ error: "Conjunto de dados ainda não sincronizado" }, { status: 404 });
  }
  return Response.json({ dataset: data });
}
