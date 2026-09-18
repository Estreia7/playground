import { DEFAULT_PAIR, isPairId } from "../../../fx/pairs.ts";
import { readState } from "./store.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });
  return Response.json(await readState(pair));
}
