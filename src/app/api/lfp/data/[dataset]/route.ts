import { isDatasetId, readDataset, writeDataset } from "../../storage";

export const dynamic = "force-dynamic";

// Next 16: params is a Promise and must be awaited.
type Ctx = { params: Promise<{ dataset: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { dataset } = await ctx.params;
  if (!isDatasetId(dataset)) {
    return Response.json({ error: "Conjunto de dados desconhecido" }, { status: 404 });
  }

  const data = await readDataset(dataset);
  if (!data) {
    return Response.json({ error: "Conjunto de dados não encontrado" }, { status: 404 });
  }

  return Response.json({ dataset: data });
}

/** Replaces a dataset. Admin only.
 *  Until the auth layer lands (phase 12) this stays closed: these numbers are
 *  what the whole site teaches from, so an open write endpoint is not a
 *  temporary convenience worth having. */
export async function PUT(request: Request, ctx: Ctx) {
  const { dataset } = await ctx.params;
  if (!isDatasetId(dataset)) {
    return Response.json({ error: "Conjunto de dados desconhecido" }, { status: 404 });
  }

  const { verifyAdmin } = await import("../../auth");
  if (!(await verifyAdmin(request))) {
    return Response.json({ error: "Não autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const result = await writeDataset(dataset, body);
  if (!result.ok) {
    return Response.json(
      { error: "Validação falhou", issues: result.errors },
      { status: 400 }
    );
  }

  return Response.json({ ok: true, version: result.version });
}
