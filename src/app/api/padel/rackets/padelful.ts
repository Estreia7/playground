import { PADELFUL } from "../../../padel/rackets/catalog.ts";

/* Talking to Padelful. No key, no account: both doors are open and
   rate-limited for anonymous callers, so everything read here is cached by
   store.ts and nothing is asked twice in a day.

   REST (/api/v1) returns the whole catalogue in one call and is the door to
   prefer. The MCP server (/api/mcp, streamable HTTP) exposes the same data as
   tools — search_rackets, get_racket, get_recommendations — one racket or one
   search at a time. It is the fallback whenever REST answers with an error,
   which it did for a whole evening while this was written. */

const TIMEOUT_MS = 15_000;

type Raw = Record<string, unknown>;

export class PadelfulError extends Error {}

/** The whole catalogue from REST, or null when REST is not answering. */
export async function restCatalogue(): Promise<Raw[] | null> {
  try {
    const res = await fetch(`${PADELFUL}/api/v1/rackets?locale=en&limit=2000`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { rackets?: Raw[] } };
    const list = json.data?.rackets;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

let rpcId = 0;

/** The JSON a tool returned. MCP answers as server-sent events: the result is
    in a `data:` line, and the tool's own output is a JSON string inside its
    first text block. */
export function parseToolReply(body: string): unknown {
  const line = body
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .pop();
  const msg = JSON.parse(line ?? body) as {
    result?: { content?: { type: string; text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  if (msg.error) throw new PadelfulError(msg.error.message ?? "MCP error");
  const text = msg.result?.content?.find((c) => c.type === "text")?.text;
  if (msg.result?.isError || text === undefined) throw new PadelfulError(text ?? "empty MCP result");
  return JSON.parse(text);
}

const RETRIES = 2;
const MAX_WAIT_MS = 10_000;

export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${PADELFUL}/api/mcp`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
    });
    // Rate-limited: wait as long as it asks (within reason) and try again.
    if (res.status === 429 && attempt < RETRIES) {
      const wait = Math.min(MAX_WAIT_MS, (Number(res.headers.get("retry-after")) || 2 ** attempt * 2) * 1000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new PadelfulError(`MCP ${name}: HTTP ${res.status}`);
    return parseToolReply(await res.text());
  }
}

export async function searchRackets(args: {
  query?: string;
  brand?: string;
  shape?: "Round" | "Diamond";
  minRating?: number;
}): Promise<Raw[]> {
  const out = (await callTool("search_rackets", { ...args, locale: "en", limit: 50 })) as { rackets?: Raw[] };
  return Array.isArray(out.rackets) ? out.rackets : [];
}

export async function getRacket(slug: string): Promise<Raw | null> {
  const out = (await callTool("get_racket", { slug, locale: "en" })) as { found?: boolean; racket?: Raw };
  return out.found && out.racket ? out.racket : null;
}

export async function recommendations(args: {
  level: "beginner" | "intermediate" | "advanced";
  playStyle: "control" | "power" | "balanced";
  budget?: number;
}): Promise<Raw[]> {
  const out = (await callTool("get_recommendations", { ...args, locale: "en" })) as { recommendations?: Raw[] };
  return Array.isArray(out.recommendations) ? out.recommendations : [];
}

/** Runs `fn` over `items`, `limit` at a time — polite to a rate-limited host. */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
