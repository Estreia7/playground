import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  hashIp,
  hashToken,
  LIMITS,
  newToken,
  sweep,
  throttle,
  TRANSITIONS,
  UNVERIFIED_TTL_MS,
  validateTicketInput,
  type Ticket,
} from "../src/app/api/lfp/ticketsCore.ts";

const good = {
  kind: "dados",
  target: "storage/lfp/iva.json",
  title: "Taxa reduzida da Madeira",
  body: "Mudou para 4% em outubro de 2024.",
  sourceUrl: "https://example.test/dlr-6-2024",
  email: "Alguem@Example.test",
};

/* ── validation ─────────────────────────────────────────── */

test("a complete submission passes and the e-mail is normalised", () => {
  const r = validateTicketInput(good);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.email, "alguem@example.test");
});

test("the honeypot rejects bots without explaining itself", () => {
  const r = validateTicketInput({ ...good, website: "http://spam" });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(r.errors, ["rejeitado"]);
  // an empty honeypot is a person
  assert.ok(validateTicketInput({ ...good, website: "" }).ok);
});

test("every required field is named when missing", () => {
  const r = validateTicketInput({ kind: "dados" });
  assert.ok(!r.ok);
  if (!r.ok) {
    for (const f of ["target", "title", "body", "sourceUrl", "email"]) {
      assert.ok(r.errors.some((e) => e.startsWith(f)), `missing error for ${f}`);
    }
  }
});

test("source must be https and e-mail must look like one", () => {
  const a = validateTicketInput({ ...good, sourceUrl: "http://insecure" });
  assert.ok(!a.ok && a.errors.some((e) => e.includes("https")));
  const b = validateTicketInput({ ...good, email: "not-an-email" });
  assert.ok(!b.ok && b.errors.some((e) => e.startsWith("email")));
  const c = validateTicketInput({ ...good, kind: "spam" });
  assert.ok(!c.ok && c.errors.some((e) => e.startsWith("kind")));
});

test("length caps are enforced", () => {
  const r = validateTicketInput({ ...good, body: "x".repeat(LIMITS.body + 1) });
  assert.ok(!r.ok && r.errors.some((e) => e.includes("máximo")));
});

/* ── throttle ───────────────────────────────────────────── */

test("throttle allows the limit, then refuses, then recovers after the window", () => {
  const hits = new Map<string, number[]>();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(throttle(hits, "a", t0 + i, 5, 3600_000), true);
  assert.equal(throttle(hits, "a", t0 + 10, 5, 3600_000), false);
  // a different key is unaffected
  assert.equal(throttle(hits, "b", t0 + 10, 5, 3600_000), true);
  // after the window the oldest hits expire
  assert.equal(throttle(hits, "a", t0 + 3600_001, 5, 3600_000), true);
});

/* ── sweep and lifecycle ────────────────────────────────── */

const mk = (over: Partial<Ticket>): Ticket => ({
  id: "t1",
  kind: "dados",
  target: "x",
  title: "x",
  body: "x",
  sourceUrl: "https://x",
  email: "a@b.cd",
  status: "pending_email",
  tokenHash: "h",
  ipHash: "i",
  createdAt: 0,
  verifiedAt: null,
  updatedAt: 0,
  reply: null,
  ...over,
});

test("sweep drops only unverified tickets past their TTL", () => {
  const now = 10 * UNVERIFIED_TTL_MS;
  const keep = [
    mk({ id: "fresh", createdAt: now - 1000 }),
    mk({ id: "verified-old", status: "pending", createdAt: 0 }),
    mk({ id: "applied-old", status: "applied", createdAt: 0 }),
  ];
  const drop = mk({ id: "stale", createdAt: now - UNVERIFIED_TTL_MS - 1 });
  const out = sweep([...keep, drop], now);
  assert.deepEqual(out.map((t) => t.id), ["fresh", "verified-old", "applied-old"]);
});

test("transitions: verification is the only way out of pending_email, applied is terminal", () => {
  assert.equal(canTransition("pending_email", "pending"), true);
  assert.equal(canTransition("pending_email", "accepted"), false);
  assert.equal(canTransition("pending", "accepted"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  assert.equal(canTransition("accepted", "applied"), true);
  assert.equal(canTransition("applied", "pending"), false);
  assert.equal(canTransition("rejected", "pending"), true);
  // every status in the table has an entry
  for (const s of Object.keys(TRANSITIONS)) assert.ok(Array.isArray(TRANSITIONS[s as keyof typeof TRANSITIONS]));
});

/* ── tokens ─────────────────────────────────────────────── */

test("tokens are long, unique, and only their hash is comparable", () => {
  const a = newToken();
  const b = newToken();
  assert.ok(a.length >= 40);
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
  assert.equal(hashToken(a).length, 64);
});

test("ip hashing is salted and never reveals the ip", () => {
  const h = hashIp("203.0.113.9", "salt");
  assert.equal(h.length, 32);
  assert.ok(!h.includes("203"));
  assert.notEqual(h, hashIp("203.0.113.9", "other-salt"));
});
