import { test } from "node:test";
import assert from "node:assert/strict";
import { eur, eur0, numPlain, parseNumber, pct } from "../src/app/lfp/format.ts";

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

/* numPlain feeds the input fields: locale decimal separator, no thousands
   grouping, and never a trailing ",00" the user didn't type. */

test("numPlain uses the locale decimal separator", () => {
  assert.equal(numPlain(212.07, "pt"), "212,07");
  assert.equal(numPlain(212.07, "en"), "212.07");
});

test("numPlain never groups thousands", () => {
  // A separator inside the field would be picked up by the next keystroke.
  assert.equal(numPlain(1500, "pt"), "1500");
  assert.equal(numPlain(1234567.5, "pt"), "1234567,5");
});

test("numPlain shows only the decimals the value has", () => {
  assert.equal(numPlain(1500, "pt"), "1500");
  assert.equal(numPlain(6.15, "pt"), "6,15");
  assert.equal(numPlain(1.005, "pt"), "1,01");
});

test("numPlain is empty for non-finite so a field never shows NaN", () => {
  assert.equal(numPlain(NaN), "");
  assert.equal(numPlain(Infinity), "");
});

test("numPlain round-trips through parseNumber", () => {
  for (const v of [0, 6.15, 212.07, 1500, 99999.99]) {
    assert.equal(parseNumber(numPlain(v, "pt")), v);
    assert.equal(parseNumber(numPlain(v, "en")), v);
  }
});
