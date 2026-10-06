import { promises as fs } from "fs";
import path from "path";

/* Shared server plumbing for the crypto routes: one fetch helper, one
   in-memory memo, and JSON files on disk.

   State hangs off a globalThis symbol rather than module scope, because Next
   compiles route handlers and the instrumentation entry separately and dev
   recompiles on edit; a module-level Map can quietly become two. */

export const STORAGE_DIR = path.join(process.cwd(), "storage", "crypto");

interface Entry {
  value?: unknown;
  at: number;
  pending?: Promise<unknown>;
}

const KEY = Symbol.for("playground.crypto.cache");

function table(): Map<string, Entry> {
  const holder = globalThis as unknown as Record<symbol, Map<string, Entry> | undefined>;
  if (!holder[KEY]) holder[KEY] = new Map();
  return holder[KEY];
}

/** Cached value for `key`, reloaded when older than `ttlMs`.

    Callers share one in-flight load. When a reload fails the last good value
    is served instead, so a provider hiccup shows slightly old numbers rather
    than an error page. With `stale: true` an expired value is returned at once
    and the reload runs in the background. */
export async function memo<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts: { stale?: boolean } = {}
): Promise<T> {
  const t = table();
  const entry = t.get(key);
  const fresh = entry && "value" in entry && Date.now() - entry.at < ttlMs;
  if (fresh) return entry.value as T;

  const start = (): Promise<T> => {
    const current = t.get(key);
    if (current?.pending) return current.pending as Promise<T>;
    const pending = load()
      .then((value) => {
        t.set(key, { value, at: Date.now() });
        return value;
      })
      .catch((err) => {
        const prev = t.get(key);
        if (prev && "value" in prev) {
          t.set(key, { value: prev.value, at: prev.at });
          return prev.value as T;
        }
        t.delete(key);
        throw err;
      });
    t.set(key, { ...(current ?? { at: 0 }), pending });
    return pending;
  };

  if (opts.stale && entry && "value" in entry) {
    start().catch(() => {});
    return entry.value as T;
  }
  return start();
}

export async function fetchJson<T>(url: string, opts: { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        headers: { accept: "application/json", "user-agent": "playground-crypto/1.0" },
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      if (!res.ok) {
        // A 4xx other than rate limiting will not get better on a retry.
        const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
        (err as Error & { final?: boolean }).final = true;
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if ((err as { final?: boolean }).final) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(STORAGE_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Write through a temporary file and rename, so a crash mid-write cannot
    leave half a JSON file behind. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  const full = path.join(STORAGE_DIR, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = full + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, full);
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
