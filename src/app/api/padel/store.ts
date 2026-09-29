import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { EMPTY_CLUB, type Club } from "../../padel/core/types.ts";
import { apply, type Action, type Result } from "../../padel/core/actions.ts";

/* The club is one JSON file on the VPS disk (storage/padel/club.json,
   git-ignored). It is small — a few hundred matches a year — so every request
   reads it whole and every change writes it whole.

   Changes are queued one behind the other so two phones saving at the same
   moment cannot interleave a read and a write. Each write goes to a temp file
   and is renamed into place, and the previous version is kept as club.bak.json:
   a crash mid-write never leaves a club that won't parse. */

const DIR = path.join(process.cwd(), "storage", "padel");
const FILE = path.join(DIR, "club.json");
const BACKUP = path.join(DIR, "club.bak.json");

const QUEUE_KEY = Symbol.for("playground.padel.queue");

function queue(): { tail: Promise<unknown> } {
  const holder = globalThis as unknown as Record<symbol, { tail: Promise<unknown> } | undefined>;
  if (!holder[QUEUE_KEY]) holder[QUEUE_KEY] = { tail: Promise.resolve() };
  return holder[QUEUE_KEY];
}

export async function readClub(): Promise<Club> {
  try {
    const club = JSON.parse(await fs.readFile(FILE, "utf-8")) as Club;
    if (club && Array.isArray(club.players) && Array.isArray(club.tournaments)) return club;
  } catch {
    // missing on first run, or unreadable — fall through
  }
  try {
    return JSON.parse(await fs.readFile(BACKUP, "utf-8")) as Club;
  } catch {
    return EMPTY_CLUB;
  }
}

async function writeClub(club: Club): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = FILE + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(club), "utf-8");
  await fs.copyFile(FILE, BACKUP).catch(() => undefined);
  await fs.rename(tmp, FILE);
}

export function applyAction(action: Action): Promise<Result> {
  const q = queue();
  const run = q.tail.then(async () => {
    const club = await readClub();
    const result = apply(club, action, {
      rng: Math.random,
      newId: () => crypto.randomBytes(6).toString("base64url"),
      now: () => new Date().toISOString(),
    });
    if (result.ok) await writeClub(result.club);
    return result;
  });
  q.tail = run.catch(() => undefined);
  return run;
}
