import type {
  Consultant,
  Db,
  Deal,
  DealType,
  DocEntry,
  DocRequirement,
  FileRef,
  Invoice,
  Listing,
  Payout,
  Settings,
} from "./types.ts";

/* Every change to the data is one of these actions, applied by a pure
   function. The server runs it inside its write queue; nothing else edits the
   document, so the rules about what is a valid change all live here. */

type WithOptionalId<T extends { id: string }> = Omit<T, "id"> & { id?: string };

export type Action =
  | { type: "consultant.save"; consultant: WithOptionalId<Consultant> }
  | { type: "consultant.delete"; id: string }
  /** One month of one consultant, for any number of years at once. */
  | { type: "billing.month"; consultantId: string; month: number; values: Record<string, number> }
  | { type: "consultant.goal"; consultantId: string; year: string; value: number | null }
  | { type: "listing.save"; listing: WithOptionalId<Omit<Listing, "createdAt" | "status">> }
  | { type: "listing.delete"; id: string }
  | { type: "deal.save"; deal: WithOptionalId<Omit<Deal, "createdAt" | "documents">> }
  | { type: "deal.delete"; id: string }
  | { type: "deal.doc"; dealId: string; reqId: string; entry: DocEntry | null }
  | { type: "deal.shot"; dealId: string; file: FileRef | null }
  | { type: "invoice.save"; invoice: WithOptionalId<Invoice> }
  | { type: "invoice.delete"; id: string }
  | { type: "payout.save"; payout: WithOptionalId<Payout> }
  | { type: "payout.delete"; id: string }
  | { type: "dealType.save"; dealType: WithOptionalId<DealType> }
  | { type: "dealType.delete"; id: string }
  | { type: "docReq.save"; req: WithOptionalId<DocRequirement> }
  | { type: "docReq.delete"; id: string }
  | { type: "docReq.reorder"; ids: string[] }
  | { type: "settings.save"; settings: Partial<Settings> };

export type ErrorCode = "notFound" | "invalid" | "inUse";
export type Result = { ok: true; db: Db; id?: string } | { ok: false; error: ErrorCode };

export interface Env {
  newId: () => string;
  now: () => string;
}

const fail = (error: ErrorCode): Result => ({ ok: false, error });
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const text = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function apply(db: Db, action: Action, env: Env): Result {
  switch (action.type) {
    case "consultant.save": {
      const c = action.consultant;
      if (!text(c.name)) return fail("invalid");
      const id = c.id ?? env.newId();
      const consultant: Consultant = { ...c, id, name: c.name.trim(), billingByYear: c.billingByYear ?? {} };
      return { ok: true, db: { ...db, consultants: upsert(db.consultants, consultant) }, id };
    }
    case "consultant.delete": {
      const used = db.deals.some(
        (d) =>
          (d.angariacao.kind === "team" && d.angariacao.consultantId === action.id) ||
          (d.compradores?.kind === "team" && d.compradores.consultantId === action.id),
      );
      // Someone with deals is history, not a mistake: mark them inactive instead.
      if (used) return fail("inUse");
      return { ok: true, db: { ...db, consultants: db.consultants.filter((c) => c.id !== action.id) } };
    }
    case "billing.month": {
      const c = db.consultants.find((x) => x.id === action.consultantId);
      if (!c) return fail("notFound");
      const years = Object.keys(action.values);
      if (!Number.isInteger(action.month) || action.month < 0 || action.month > 11) return fail("invalid");
      if (years.some((y) => !/^\d{4}$/.test(y) || !finite(action.values[y]))) return fail("invalid");
      const billingByMonth = { ...c.billingByMonth };
      for (const y of years) {
        const months = billingByMonth[y] ? [...billingByMonth[y]] : (Array(12).fill(0) as number[]);
        months[action.month] = action.values[y];
        billingByMonth[y] = months;
      }
      return { ok: true, db: { ...db, consultants: upsert(db.consultants, { ...c, billingByMonth }) } };
    }
    case "consultant.goal": {
      const c = db.consultants.find((x) => x.id === action.consultantId);
      if (!c) return fail("notFound");
      if (!/^\d{4}$/.test(action.year)) return fail("invalid");
      if (action.value != null && (!finite(action.value) || action.value < 0)) return fail("invalid");
      // The goal lives on the year's Business Plan, created here if there is none yet.
      const plan = c.plans?.[action.year] ?? { delivered: false, meetingHeld: false };
      const plans = { ...c.plans, [action.year]: { ...plan, billingTarget: action.value || undefined } };
      return { ok: true, db: { ...db, consultants: upsert(db.consultants, { ...c, plans }) } };
    }
    case "listing.save": {
      const l = action.listing;
      if (!db.consultants.some((c) => c.id === l.consultantId)) return fail("notFound");
      if (!finite(l.price) || l.price <= 0 || !finite(l.commissionPct) || l.commissionPct < 0) return fail("invalid");
      const listings = db.listings ?? [];
      const existing = l.id ? listings.find((x) => x.id === l.id) : undefined;
      if (l.id && !existing) return fail("notFound");
      const id = l.id ?? env.newId();
      const listing: Listing = { ...l, id, status: existing?.status ?? "ativa", createdAt: existing?.createdAt ?? env.now() };
      return { ok: true, db: { ...db, listings: upsert(listings, listing) }, id };
    }
    case "listing.delete":
      return { ok: true, db: { ...db, listings: (db.listings ?? []).filter((l) => l.id !== action.id) } };
    case "deal.save": {
      const d = action.deal;
      if (!text(d.address) && !text(d.ref)) return fail("invalid");
      if (!db.dealTypes.some((t) => t.id === d.dealTypeId)) return fail("invalid");
      if (d.price != null && !finite(d.price)) return fail("invalid");
      const existing = d.id ? db.deals.find((x) => x.id === d.id) : undefined;
      if (d.id && !existing) return fail("notFound");
      const id = d.id ?? env.newId();
      const deal: Deal = {
        ...d,
        id,
        ref: (d.ref ?? "").trim(),
        address: (d.address ?? "").trim(),
        listingSplitPct: finite(d.listingSplitPct) ? d.listingSplitPct : 50,
        documents: existing?.documents ?? {},
        createdAt: existing?.createdAt ?? env.now(),
        // The screenshot has its own action; a form save must not drop it.
        listingShot: existing?.listingShot ?? d.listingShot,
      };
      return { ok: true, db: { ...db, deals: upsert(db.deals, deal) }, id };
    }
    case "deal.delete": {
      if (!db.deals.some((d) => d.id === action.id)) return fail("notFound");
      return {
        ok: true,
        db: {
          ...db,
          deals: db.deals.filter((d) => d.id !== action.id),
          invoices: db.invoices.filter((i) => i.dealId !== action.id),
        },
      };
    }
    case "deal.doc": {
      const deal = db.deals.find((d) => d.id === action.dealId);
      if (!deal) return fail("notFound");
      const documents = { ...deal.documents };
      if (action.entry) documents[action.reqId] = action.entry;
      else delete documents[action.reqId];
      return { ok: true, db: { ...db, deals: upsert(db.deals, { ...deal, documents }) } };
    }
    case "deal.shot": {
      const deal = db.deals.find((d) => d.id === action.dealId);
      if (!deal) return fail("notFound");
      const next: Deal = { ...deal, listingShot: action.file ?? undefined };
      return { ok: true, db: { ...db, deals: upsert(db.deals, next) } };
    }
    case "invoice.save": {
      const inv = action.invoice;
      if (!db.deals.some((d) => d.id === inv.dealId)) return fail("notFound");
      if (!finite(inv.valueNoVat) || !/^\d{4}-\d{2}$/.test(inv.settlementMonth)) return fail("invalid");
      if (inv.managerPctOverride != null && !finite(inv.managerPctOverride)) return fail("invalid");
      const id = inv.id ?? env.newId();
      return { ok: true, db: { ...db, invoices: upsert(db.invoices, { ...inv, id }) }, id };
    }
    case "invoice.delete":
      return { ok: true, db: { ...db, invoices: db.invoices.filter((i) => i.id !== action.id) } };
    case "payout.save": {
      const p = action.payout;
      if (!finite(p.amount) || !text(p.date)) return fail("invalid");
      const id = p.id ?? env.newId();
      return { ok: true, db: { ...db, payouts: upsert(db.payouts, { ...p, id }) }, id };
    }
    case "payout.delete":
      return { ok: true, db: { ...db, payouts: db.payouts.filter((p) => p.id !== action.id) } };
    case "dealType.save": {
      const t = action.dealType;
      if (!text(t.name) || !finite(t.defaultManagerPct)) return fail("invalid");
      const id = t.id ?? env.newId();
      return { ok: true, db: { ...db, dealTypes: upsert(db.dealTypes, { ...t, id, name: t.name.trim() }) }, id };
    }
    case "dealType.delete": {
      if (db.deals.some((d) => d.dealTypeId === action.id)) return fail("inUse");
      return {
        ok: true,
        db: {
          ...db,
          dealTypes: db.dealTypes.filter((t) => t.id !== action.id),
          docRequirements: db.docRequirements.map((r) => ({
            ...r,
            appliesTo: r.appliesTo.filter((x) => x !== action.id),
          })),
        },
      };
    }
    case "docReq.save": {
      const r = action.req;
      if (!text(r.name)) return fail("invalid");
      const id = r.id ?? env.newId();
      const order = r.order ?? db.docRequirements.length;
      return {
        ok: true,
        db: { ...db, docRequirements: upsert(db.docRequirements, { ...r, id, order, name: r.name.trim() }) },
        id,
      };
    }
    case "docReq.delete":
      return { ok: true, db: { ...db, docRequirements: db.docRequirements.filter((r) => r.id !== action.id) } };
    case "docReq.reorder": {
      const pos = new Map(action.ids.map((id, i) => [id, i]));
      return {
        ok: true,
        db: {
          ...db,
          docRequirements: db.docRequirements.map((r) => ({ ...r, order: pos.get(r.id) ?? r.order })),
        },
      };
    }
    case "settings.save":
      return { ok: true, db: { ...db, settings: { ...db.settings, ...action.settings } } };
    default:
      return fail("invalid");
  }
}
