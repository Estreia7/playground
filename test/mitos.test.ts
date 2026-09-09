import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateMyth, validateMyths } from "../src/app/lfp/mitos/engine.ts";

const good = {
  id: "abc-1",
  verdict: "mito",
  claim: { pt: "A", en: "A" },
  explanation: { pt: "B", en: "B" },
  source: "https://example.org",
  learnMore: "/lfp/individual/irs",
};

test("validateMyth accepts a complete entry", () => {
  assert.deepEqual(validateMyth(good), []);
});

test("validateMyth names every broken field", () => {
  const errors = validateMyth({ ...good, id: "Bad Id", verdict: "talvez", claim: { pt: "" }, source: "http://x", learnMore: "/x" });
  assert.ok(errors.some((e) => e.startsWith("id:")));
  assert.ok(errors.some((e) => e.startsWith("verdict:")));
  assert.ok(errors.some((e) => e.startsWith("claim:")));
  assert.ok(errors.some((e) => e.startsWith("source:")));
  assert.ok(errors.some((e) => e.startsWith("learnMore:")));
});

test("validateMyths keeps the valid ones and rejects duplicates", () => {
  const r = validateMyths({ myths: [good, { ...good, id: "abc-1" }, { ...good, id: "x", verdict: "nope" }] });
  assert.equal(r.myths.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.id), ["abc-1", "x"]);
});

test("the published mitos.json is fully valid", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "storage", "lfp", "mitos.json"), "utf8"));
  const r = validateMyths(raw);
  assert.deepEqual(r.rejected, []);
  assert.ok(r.myths.length >= 10);
  // Both verdicts must be present, or the page becomes a "click mito" reflex.
  assert.ok(r.myths.some((m) => m.verdict === "verdade"));
  assert.ok(r.myths.some((m) => m.verdict === "mito"));
});
