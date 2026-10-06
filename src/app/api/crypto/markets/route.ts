import { marketsPayload } from "../lib/markets.ts";

export const dynamic = "force-dynamic";

/* The overview table and the chart page's coin list. Cached server-side
   (prices 90 s, signals 15 min), so polling this costs the providers nothing. */
export async function GET() {
  try {
    return Response.json(await marketsPayload());
  } catch (err) {
    return Response.json(
      { error: "Market data is unavailable right now. " + (err instanceof Error ? err.message : "") },
      { status: 502 }
    );
  }
}
