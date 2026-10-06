import { stadPayload } from "../lib/stad.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await stadPayload());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "STAD data is unavailable." }, { status: 502 });
  }
}
