/* Contribution tickets — the pure parts. No fs, no fetch, no clock (time
   is passed in), so the rules can be unit-tested without a server.

   A ticket is a PROPOSAL. It never changes a published number by itself:
   the admin reads it, decides, and edits the dataset. The public write path
   can only ever grow this inbox. */

import crypto from "crypto";

export const TICKET_KINDS = ["dados", "conteudo", "pergunta", "outro"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_STATUSES = ["pending_email", "pending", "accepted", "rejected", "applied"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketInput {
  kind: TicketKind;
  /** What the proposal is about — a page, a dataset, a question id. */
  target: string;
  title: string;
  body: string;
  sourceUrl: string;
  email: string;
}

export interface Ticket extends TicketInput {
  id: string;
  status: TicketStatus;
  /** sha256 of the verification token; the token itself lives only in the e-mail. */
  tokenHash: string;
  /** Salted hash of the submitting IP, for throttling and spam review. Never the IP. */
  ipHash: string;
  createdAt: number;
  verifiedAt: number | null;
  updatedAt: number;
  reply: string | null;
}

export const LIMITS = { target: 120, title: 120, body: 4000, sourceUrl: 500, email: 254 } as const;

/** Unverified tickets are swept after this long. */
export const UNVERIFIED_TTL_MS = 48 * 60 * 60 * 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates a public submission. The honeypot field `website` must be
 *  absent or empty — bots fill every field; people never see it. */
export function validateTicketInput(raw: unknown): { ok: true; value: TicketInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["payload inválido"] };
  const r = raw as Record<string, unknown>;

  if (typeof r.website === "string" && r.website.trim() !== "") return { ok: false, errors: ["rejeitado"] };

  const str = (k: keyof TicketInput, max: number, required = true) => {
    const v = r[k];
    if (typeof v !== "string" || v.trim() === "") {
      if (required) errors.push(`${k}: obrigatório`);
      return "";
    }
    if (v.length > max) errors.push(`${k}: máximo ${max} caracteres`);
    return v.trim();
  };

  const kind = r.kind;
  if (!(TICKET_KINDS as readonly unknown[]).includes(kind)) errors.push(`kind: tem de ser um de ${TICKET_KINDS.join(", ")}`);
  const target = str("target", LIMITS.target);
  const title = str("title", LIMITS.title);
  const body = str("body", LIMITS.body);
  const sourceUrl = str("sourceUrl", LIMITS.sourceUrl);
  if (sourceUrl && !/^https:\/\/\S+$/.test(sourceUrl)) errors.push("sourceUrl: tem de ser um URL https");
  const email = str("email", LIMITS.email);
  if (email && !EMAIL.test(email)) errors.push("email: inválido");

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { kind: kind as TicketKind, target, title, body, sourceUrl, email: email.toLowerCase() } };
}

/** Sliding-window throttle. Returns true when the request is allowed and
 *  records it; the map is pruned as it goes. */
export function throttle(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  limit = 5,
  windowMs = 60 * 60 * 1000
): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Drops unverified tickets past their TTL. Everything else is kept. */
export function sweep(tickets: Ticket[], now: number, ttlMs = UNVERIFIED_TTL_MS): Ticket[] {
  return tickets.filter((t) => t.status !== "pending_email" || now - t.createdAt < ttlMs);
}

/** Allowed status moves. Verification is the only way out of pending_email;
 *  applied is terminal; a rejection can be reopened. */
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending_email: ["pending"],
  pending: ["accepted", "rejected"],
  accepted: ["applied", "rejected", "pending"],
  rejected: ["pending"],
  applied: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function newId(): string {
  return `t_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

export function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** First hop of x-forwarded-for, else a fixed marker. Never trusted for
 *  anything but throttling. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}
