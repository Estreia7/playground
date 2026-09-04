import { readAll } from "../storage";

// Reads from disk on every request so an admin edit (or a git pull on the
// VPS) is picked up without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, missing } = await readAll();

  const datasets = Object.entries(data).map(([id, d]) => ({
    id,
    year: d.meta.year,
    version: d.meta.version,
    lastVerified: d.meta.lastVerified,
    unverified: d.meta.unverified ?? false,
    source: d.meta.source,
  }));

  return Response.json({
    data,
    meta: {
      datasets,
      missing,
      // True while ANY dataset is still unconfirmed — the UI shows the amber
      // "valores por verificar" banner off this flag.
      anyUnverified: datasets.some((d) => d.unverified) || missing.length > 0,
    },
  });
}
