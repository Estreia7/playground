import { test } from "node:test";
import assert from "node:assert/strict";
import { PHRASES, fillPhrase, pickPhrases, slotsIn } from "../src/app/padel/ui/creatingPhrases.ts";
import { rngFromSeed } from "../src/app/padel/core/schedule.ts";

/* The loading jokes are shown to a room of friends the moment a tournament is
   created, so the tests guard the two ways they can go wrong: a placeholder
   left showing as "{a}", and a line that names the same person twice. */

const GROUP = ["Bruno", "Ana", "Tiago", "Sofia", "Miguel", "Rita"];

test("there are exactly 25 jokes in each language, and no two are the same", () => {
  for (const lang of ["pt", "en"] as const) {
    assert.equal(PHRASES[lang].length, 25, lang + " must have 25 lines");
    assert.equal(new Set(PHRASES[lang]).size, 25, lang + " has a duplicate line");
  }
});

test("both languages use the same placeholders line for line", () => {
  // The two lists are translations of each other, so a joke that names two
  // players in one language must name two in the other.
  PHRASES.pt.forEach((line, i) => {
    assert.deepEqual(slotsIn(line), slotsIn(PHRASES.en[i]), "line " + (i + 1) + " differs between languages");
  });
});

test("every line uses only the slots a, b and c, and at least one", () => {
  for (const lang of ["pt", "en"] as const) {
    for (const line of PHRASES[lang]) {
      const slots = slotsIn(line);
      assert.ok(slots.length >= 1, "no player is named in: " + line);
      assert.ok(slots.every((s) => ["a", "b", "c"].includes(s)), "unknown slot in: " + line);
    }
  }
});

test("no Portuguese line puts a gendered article in front of a name", () => {
  /* "o {a}" and "a {a}" would guess whether a player is a he or a she. The
     forms that carry gender are o, os, as, do, da, ao, à, no and na, and none
     may sit directly before a name.

     A bare "a" is different: after a verb like "pedir" it is the preposition
     ("pedir a Ana"), which is correct and says nothing about anyone. It is
     allowed only there, so it cannot creep in as an article. */
  for (const line of PHRASES.pt) {
    assert.ok(
      !/(o|os|as|do|da|ao|à|no|na) {[a-z]}/i.test(line),
      "gendered article before a name in: " + line,
    );
    for (const m of line.matchAll(/(S+) a {[a-z]}/gi)) {
      assert.match(m[1], /^pedir$/i, "bare 'a' before a name must follow 'pedir' in: " + line);
    }
  }
});

test("filling a line leaves no braces behind", () => {
  for (const lang of ["pt", "en"] as const) {
    for (const line of PHRASES[lang]) {
      const filled = fillPhrase(line, GROUP);
      assert.ok(!/[{}]/.test(filled), "placeholder left in: " + filled);
    }
  }
});

test("one line never names the same player twice", () => {
  const filled = fillPhrase("{a}, {b} and {c}", ["Ana", "Rui", "Sofia"]);
  const parts = filled.split(/, | and /);
  assert.equal(new Set(parts).size, 3, filled);
});

test("names are trimmed and blank ones are ignored", () => {
  assert.equal(fillPhrase("hello {a}", ["  Ana  "]), "hello Ana");
  assert.equal(fillPhrase("hello {a}", ["", "  ", "Rui"]), "hello Rui");
});

test("an empty group cannot break the screen", () => {
  assert.equal(fillPhrase("hello {a}", []), "hello …");
  assert.deepEqual(pickPhrases("en", [], 3, rngFromSeed(1)).every((l) => !/[{}]/.test(l)), true);
});

test("a run of jokes uses different lines and different players", () => {
  const out = pickPhrases("pt", GROUP, 8, rngFromSeed(7));
  assert.equal(out.length, 8);
  assert.equal(new Set(out).size, 8, "the same joke came up twice");
  for (const line of out) assert.ok(!/[{}]/.test(line), "placeholder left in: " + line);
});

test("across a run, every player gets a turn before anyone repeats", () => {
  // Eight jokes name at least eight players' worth of slots, so with six people
  // in the group everyone must have been named at least once.
  const out = pickPhrases("en", GROUP, 8, rngFromSeed(3)).join(" ");
  for (const name of GROUP) assert.ok(out.includes(name), name + " was never mentioned");
});

test("the same seed gives the same jokes and a different seed gives different ones", () => {
  const a = pickPhrases("pt", GROUP, 4, rngFromSeed(11));
  const b = pickPhrases("pt", GROUP, 4, rngFromSeed(11));
  const c = pickPhrases("pt", GROUP, 4, rngFromSeed(12));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("asking for more jokes than exist returns them all rather than repeating", () => {
  const out = pickPhrases("en", GROUP, 99, rngFromSeed(5));
  assert.equal(out.length, 25);
  assert.equal(new Set(out).size, 25);
});

test("a small group never gets the same name twice inside one joke", () => {
  // Four players is the minimum tournament. The jokes need at most three.
  const four = ["Ana", "Rui", "Sofia", "Tiago"];
  for (let seed = 1; seed <= 40; seed++) {
    for (const line of pickPhrases("en", four, 25, rngFromSeed(seed))) {
      const named = four.filter((n) => line.includes(n));
      const occurrences = named.reduce((sum, n) => sum + line.split(n).length - 1, 0);
      assert.equal(occurrences, named.length, "a name repeats in: " + line);
    }
  }
});
