import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  bandFor,
  CATEGORIES,
  dayKey,
  dayStreak,
  isDue,
  LADDER_DAYS,
  optionOrder,
  pickQuestions,
  recordAnswer,
  seededShuffle,
  validateBank,
  validateQuestion,
  type QuizQuestion,
} from "../src/app/lfp/quiz/engine.ts";

const DAY = 86_400_000;

const good: QuizQuestion = {
  id: "t-one",
  category: "iva",
  difficulty: "basico",
  prompt: { pt: "P?", en: "Q?" },
  options: { pt: ["a", "b", "c"], en: ["a", "b", "c"] },
  correctIndex: 1,
  explanation: { pt: "porque", en: "because" },
  source: "https://example.test/x",
};

/* ── validator ──────────────────────────────────────────── */

test("a well-formed question passes", () => {
  assert.deepEqual(validateQuestion(good), []);
});

test("validator names the broken field", () => {
  assert.match(validateQuestion({ ...good, correctIndex: 3 }).join(), /correctIndex/);
  assert.match(validateQuestion({ ...good, correctIndex: -1 }).join(), /correctIndex/);
  assert.match(validateQuestion({ ...good, options: { pt: ["a", "b"], en: ["a", "b", "c"] } }).join(), /mesmo número/);
  assert.match(validateQuestion({ ...good, explanation: { pt: "x", en: "" } }).join(), /explanation/);
  assert.match(validateQuestion({ ...good, source: "http://insecure" }).join(), /source/);
  assert.match(validateQuestion({ ...good, category: "vat" }).join(), /category/);
  assert.match(validateQuestion({ ...good, id: "Bad Id" }).join(), /id/);
  assert.match(validateQuestion({ ...good, learnMore: "https://elsewhere" }).join(), /learnMore/);
});

test("validateBank keeps the good, reports the bad, rejects duplicates", () => {
  const r = validateBank({ questions: [good, { ...good, correctIndex: 9 }, { ...good }] });
  assert.equal(r.questions.length, 1);
  assert.equal(r.rejected.length, 2);
  assert.match(r.rejected[1].errors.join(), /duplicado/);
});

test("validateBank survives garbage input", () => {
  assert.equal(validateBank(null).questions.length, 0);
  assert.equal(validateBank({}).rejected.length, 1);
});

/* ── selection ──────────────────────────────────────────── */

test("seededShuffle is deterministic and a permutation", () => {
  const a = seededShuffle([1, 2, 3, 4, 5, 6], 42);
  const b = seededShuffle([1, 2, 3, 4, 5, 6], 42);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4, 5, 6], 43), a);
});

test("optionOrder covers every index exactly once", () => {
  const o = optionOrder(4, 7);
  assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
});

const bank: QuizQuestion[] = ["a", "b", "c", "d", "e"].map((id, i) => ({
  ...good,
  id,
  category: i % 2 ? "iva" : "irs",
}));

test("pickQuestions filters by category and caps the count", () => {
  const p = pickQuestions(bank, { mode: "iva", count: 10, seed: 1, seen: {}, now: 0 });
  assert.ok(p.every((q) => q.category === "iva"));
  assert.equal(p.length, 2);
  assert.equal(pickQuestions(bank, { mode: "geral", count: 3, seed: 1, seen: {}, now: 0 }).length, 3);
});

test("pickQuestions puts due questions before ones answered recently", () => {
  const now = 100 * DAY;
  // "a" answered correctly just now → not due; everything else never seen → due.
  const seen = recordAnswer({}, "a", true, now);
  const p = pickQuestions(bank, { mode: "geral", count: 5, seed: 3, seen, now });
  assert.equal(p[p.length - 1].id, "a");
});

/* ── spaced repetition ──────────────────────────────────── */

test("a wrong answer resets the ladder, a right one climbs it", () => {
  let seen = recordAnswer({}, "q", true, 0);
  seen = recordAnswer(seen, "q", true, 0);
  assert.equal(seen.q.streak, 2);
  assert.equal(seen.q.correct, 2);
  seen = recordAnswer(seen, "q", false, 0);
  assert.equal(seen.q.streak, 0);
  assert.equal(seen.q.attempts, 3);
});

test("isDue follows the ladder and tops out", () => {
  const at = 0;
  const rung = (streak: number) => ({ attempts: streak, correct: streak, streak, lastSeen: at });
  assert.equal(isDue(undefined, at), true);
  assert.equal(isDue(rung(0), at + 0.5 * DAY), false);
  assert.equal(isDue(rung(0), at + 1 * DAY), true);
  assert.equal(isDue(rung(1), at + 2 * DAY), false);
  assert.equal(isDue(rung(1), at + 3 * DAY), true);
  assert.equal(isDue(rung(3), at + 20 * DAY), false);
  assert.equal(isDue(rung(3), at + 21 * DAY), true);
  // beyond the ladder stays at the last rung
  assert.equal(isDue(rung(9), at + 21 * DAY), true);
  assert.equal(LADDER_DAYS[LADDER_DAYS.length - 1], 21);
});

/* ── scoring and streak ─────────────────────────────────── */

test("bands are monotonic in score and clamp nonsense", () => {
  assert.equal(bandFor(0), "grumete");
  assert.equal(bandFor(0.34), "grumete");
  assert.equal(bandFor(0.35), "marinheiro");
  assert.equal(bandFor(0.6), "piloto");
  assert.equal(bandFor(0.8), "capitao");
  assert.equal(bandFor(0.95), "navegador");
  assert.equal(bandFor(1), "navegador");
  assert.equal(bandFor(NaN), "grumete");
  assert.equal(bandFor(7), "navegador");
});

test("dayStreak counts consecutive days and tolerates today being untouched", () => {
  const today = new Date(2026, 8, 5, 12).getTime();
  const d = (n: number) => dayKey(today - n * DAY);
  assert.equal(dayStreak([], today), 0);
  assert.equal(dayStreak([d(0)], today), 1);
  assert.equal(dayStreak([d(0), d(1), d(2)], today), 3);
  assert.equal(dayStreak([d(1), d(2)], today), 2); // yesterday and before, not yet today
  assert.equal(dayStreak([d(2), d(3)], today), 0); // gap yesterday → broken
  assert.equal(dayStreak([d(0), d(2)], today), 1); // gap at day 1
});

/* ── the PUBLISHED bank ─────────────────────────────────── */

const bankFile = path.join(process.cwd(), "storage", "lfp", "quiz.json");
const published = JSON.parse(fs.readFileSync(bankFile, "utf8"));
const validated = validateBank(published);

test("every published question passes the validator", () => {
  assert.deepEqual(validated.rejected, []);
  assert.ok(validated.questions.length >= 20);
});

test("every category has at least four published questions", () => {
  for (const c of CATEGORIES) {
    const n = validated.questions.filter((q) => q.category === c).length;
    assert.ok(n >= 4, `${c}: ${n}`);
  }
});

test("the correct answer is never in the same slot for every question", () => {
  const slots = new Set(validated.questions.map((q) => q.correctIndex));
  assert.ok(slots.size >= 3, `correct answers only ever at ${[...slots]}`);
});

test("published answers agree with the published tax datasets", () => {
  const load = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "storage", "lfp", f), "utf8"));
  const tsu = load("tsu.json");
  const iva = load("iva.json");
  const irc = load("irc.json");
  const q = (id: string) => validated.questions.find((x) => x.id === id)!;
  const answer = (id: string) => q(id).options.pt[q(id).correctIndex];

  assert.match(answer("tsu-taxa-trabalhador"), new RegExp(`^${Math.round(tsu.regimes[0].trabalhador * 100)}%`));
  assert.match(answer("tsu-patronal"), new RegExp((tsu.regimes[0].entidadePatronal * 100).toFixed(2).replace(".", ",")));
  assert.match(answer("tsu-subsidio-refeicao"), new RegExp(String(tsu.subsidioRefeicao.cartao).replace(".", ",")));
  assert.match(answer("iva-taxa-normal"), new RegExp(`^${iva.rates.continente.normal * 100}%`));
  assert.match(answer("iva-madeira"), new RegExp(`^${iva.rates.madeira.reduzida * 100}%`));
  assert.match(answer("irc-taxa-2026"), new RegExp(`^${irc.taxaGeral * 100}%`));
  assert.match(answer("irc-pme"), new RegExp(String(irc.pme.limiteTranche).replace(/\B(?=(\d{3})+(?!\d))/g, " ")));
});
