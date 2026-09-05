import { promises as fs } from "fs";
import path from "path";
import type { EconData, EconId } from "@/app/lfp/types";

/* Economic datasets written by scripts/sync-data.mjs. Read-only from the
   app: the sync script is the only writer, so the files stay an audit
   trail of what the official APIs returned and when. */

const ECON_DIR = path.join(process.cwd(), "storage", "lfp", "econ");

export const ECON_IDS = ["inflation", "cofog", "wages"] as const;

export function isEconId(v: string): v is EconId {
  return (ECON_IDS as readonly string[]).includes(v);
}

export async function readEcon<K extends EconId>(id: K): Promise<EconData[K] | null> {
  try {
    const raw = await fs.readFile(path.join(ECON_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as EconData[K];
  } catch {
    return null;
  }
}

export async function readAllEcon(): Promise<{ data: Partial<EconData>; missing: EconId[] }> {
  const data: Partial<EconData> = {};
  const missing: EconId[] = [];
  await Promise.all(
    ECON_IDS.map(async (id) => {
      const d = await readEcon(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (d) (data as any)[id] = d;
      else missing.push(id);
    })
  );
  return { data, missing };
}
