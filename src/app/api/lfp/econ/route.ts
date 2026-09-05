import { readAllEcon } from "./read";

// Read from disk per request so a fresh sync (or a git pull on the VPS) is
// picked up without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, missing } = await readAllEcon();

  const datasets = Object.entries(data).map(([id, d]) => ({
    id,
    year: d.meta.year,
    retrievedAt: d.meta.retrievedAt,
    datasetCode: d.meta.datasetCode,
    source: d.meta.source,
  }));

  return Response.json({ data, meta: { datasets, missing } });
}
