import { DEFAULT_PAIR, isPairId } from "../../../../fx/pairs.ts";
import { isTimeframeId, DEFAULT_TIMEFRAME } from "../../../../fx/timeframes.ts";
import { readState, placeOrder, validateOrder, attachSetupContext } from "../store.ts";
import { readCachedSetups } from "../../scan.ts";
import { requireAccess } from "../../auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const pair = typeof b.pair === "string" ? b.pair : DEFAULT_PAIR;
  const tf = typeof b.tf === "string" ? b.tf : DEFAULT_TIMEFRAME;

  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });
  if (!isTimeframeId(tf)) return Response.json({ error: "Unknown timeframe." }, { status: 400 });

  const state = await readState(pair);
  const input = {
    pair,
    tf,
    direction: b.direction as "long" | "short",
    type: (b.type ?? "market") as "market" | "limit" | "stop",
    price: typeof b.price === "number" ? b.price : null,
    lots: Number(b.lots),
    stop: typeof b.stop === "number" ? b.stop : null,
    target: typeof b.target === "number" ? b.target : null,
    note: typeof b.note === "string" ? b.note : undefined,
  };

  const issues = validateOrder(input, state.freeMargin, state.account.leverage);
  if (issues.length > 0) {
    return Response.json({ error: "That order cannot be placed.", issues }, { status: 400 });
  }

  const setupId = typeof b.setupId === "string" ? b.setupId : null;
  const setup = setupId ? (await readCachedSetups(pair)).find((s) => s.id === setupId) ?? null : null;

  const order = await placeOrder({ ...input, setup });

  // A market order fills on the next candle, so the setup context is recorded
  // against the order now and copied onto the position when it opens.
  if (setup) await attachSetupContext(order.id, setup);

  return Response.json({ order, state: await readState(pair) });
}
