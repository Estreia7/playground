import { test } from "node:test";
import assert from "node:assert/strict";
import { eur, eur0, parseNumber, pct } from "../src/app/lfp/format.ts";

/* parseNumber is what stands between a keyboard and the calculators. It
   has to accept the ways a Portuguese user actually types money, and it
   has to refuse to invent a number out of an unfinished one. */

test("parseNumber accepts a Portuguese decimal comma", () => {
  assert.equal(parseNumber("1500,50"), 1500.5);
  assert.equal(parseNumber("6,15"), 6.15);
});

test("parseNumber accepts a dot as well", () => {
  assert.equal(parseNumber("1500.50"), 1500.5);
});

test("parseNumber ignores spaces and a pasted euro sign", () => {
  assert.equal(parseNumber("1 500"), 1500);
  assert.equal(parseNumber("1500 €"), 1500);
  assert.equal(parseNumber("€1500"), 1500);
});

test("parseNumber returns null for a draft that is not a number yet", () => {
  // These must NOT become 0 — that would overwrite the field mid-keystroke.
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("-"), null);
  assert.equal(parseNumber("abc"), null);
});

test("parseNumber handles zero and negatives explicitly", () => {
  assert.equal(parseNumber("0"), 0);
  assert.equal(parseNumber("-5"), -5);
});

/* Formatting: the site is PT-first, so figures must read as Portuguese. */

test("eur formats with a comma decimal and trailing euro sign", () => {
  const s = eur(1166.83);
  assert.match(s, /1166,83/);
  assert.match(s, /€\s*$/);
});

test("eur0 drops the cents", () => {
  assert.doesNotMatch(eur0(1166.83), /,/);
  assert.match(eur0(1166.83), /1167/);
});

test("pct takes a fraction, not a percentage", () => {
  assert.match(pct(0.11), /11,0\s*%/);
  assert.match(pct(0.2375), /23,8\s*%/);
});

test("formatters do not throw on non-finite input", () => {
  assert.equal(eur(NaN), "—");
  assert.equal(pct(Infinity), "—");
});
