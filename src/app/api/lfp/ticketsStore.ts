import { promises as fs } from "fs";
import path from "path";
import { sweep, type Ticket } from "./ticketsCore";

/* Ticket inbox on disk: storage/lfp/tickets.json. Reads sweep expired
   unverified tickets; writes go through one promise chain so two requests
   cannot interleave a read-modify-write, and the previous file is kept as
   a rolling backup. This file is NOT source content like the datasets —
   it holds e-mail addresses — so it is git-ignored. */

const FILE = path.join(process.cwd(), "storage", "lfp", "tickets.json");
const BACKUP = path.join(process.cwd(), "storage", "lfp", "tickets.bak.json");

interface Inbox {
  version: 1;
  tickets: Ticket[];
}

let chain: Promise<unknown> = Promise.resolve();

/** Serialises every mutation. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readRaw(): Promise<Inbox> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf-8")) as Inbox;
    if (raw?.version === 1 && Array.isArray(raw.tickets)) return raw;
  } catch {
    /* missing or corrupt → empty inbox */
  }
  return { version: 1, tickets: [] };
}

async function writeRaw(inbox: Inbox) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  try {
    await fs.copyFile(FILE, BACKUP);
  } catch {
    /* first write */
  }
  await fs.writeFile(FILE, JSON.stringify(inbox, null, 2), "utf-8");
}

export async function listTickets(now = Date.now()): Promise<Ticket[]> {
  return serial(async () => {
    const inbox = await readRaw();
    const swept = sweep(inbox.tickets, now);
    if (swept.length !== inbox.tickets.length) await writeRaw({ version: 1, tickets: swept });
    return swept;
  });
}

export async function addTicket(ticket: Ticket): Promise<void> {
  return serial(async () => {
    const inbox = await readRaw();
    inbox.tickets.push(ticket);
    await writeRaw(inbox);
  });
}

/** Applies `mutate` to one ticket; returns the updated ticket or null. */
export async function updateTicket(
  find: (t: Ticket) => boolean,
  mutate: (t: Ticket) => Ticket
): Promise<Ticket | null> {
  return serial(async () => {
    const inbox = await readRaw();
    const i = inbox.tickets.findIndex(find);
    if (i < 0) return null;
    inbox.tickets[i] = mutate(inbox.tickets[i]);
    await writeRaw(inbox);
    return inbox.tickets[i];
  });
}

export async function removeTicket(id: string): Promise<boolean> {
  return serial(async () => {
    const inbox = await readRaw();
    const before = inbox.tickets.length;
    inbox.tickets = inbox.tickets.filter((t) => t.id !== id);
    if (inbox.tickets.length === before) return false;
    await writeRaw(inbox);
    return true;
  });
}
