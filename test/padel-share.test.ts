import { test } from "node:test";
import assert from "node:assert/strict";
import type { Match, Round, Tournament } from "../src/app/padel/core/types.ts";
import { MAX_HEIGHT, SIZE, blockHeight, paginate, revision } from "../src/app/padel/share/paginate.ts";

/* The images are what gets pasted into a group chat, so the split has to be
   right: no match missing, none repeated, no round torn apart without a marker,
   and no image so tall that the chat crops it. */

let n = 0;
const match = (court: number, scored = false): Match => ({
  id: "m" + ++n,
  court,
  a: ["p1", "p2"],
  b: ["p3", "p4"],
  scoreA: scored ? 16 : null,
  scoreB: scored ? 8 : null,
});

function tournament(rounds: number, matchesPerRound: number, byes: string[] = []): Tournament {
  const rs: Round[] = Array.from({ length: rounds }, (_, i) => ({
    n: i + 1,
    matches: Array.from({ length: matchesPerRound }, (_, c) => match(c + 1)),
    byes,
  }));
  return {
    id: "t",
    name: "Sexta",
    format: "americano",
    scoring: { kind: "points", total: 24 },
    courts: matchesPerRound,
    playerIds: ["p1", "p2", "p3", "p4"],
    plannedRounds: rounds,
    rounds: rs,
    status: "active",
    createdAt: "2026-09-30T20:00:00.000Z",
  };
}

const idsOf = (pages: ReturnType<typeof paginate>) =>
  pages.flatMap((p) => p.blocks.flatMap((b) => b.matches.map((m) => m.id)));

test("a small tournament fits on one image", () => {
  const pages = paginate(tournament(3, 2));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].total, 1);
  assert.equal(pages[0].first, true);
});

test("a full eight-player americano is two images, not three", () => {
  // 7 rounds of 2 matches is the everyday case and the one the split is tuned for.
  const pages = paginate(tournament(7, 2));
  assert.equal(pages.length, 2);
});

test("every match appears exactly once, in order", () => {
  const t = tournament(11, 3);
  const expected = t.rounds.flatMap((r) => r.matches.map((m) => m.id));
  assert.deepEqual(idsOf(paginate(t)), expected);
});

test("no image is taller than the limit, and each height is exactly what its contents add up to", () => {
  for (const [rounds, per] of [[7, 2], [11, 3], [5, 6], [20, 2]] as const) {
    for (const p of paginate(tournament(rounds, per))) {
      assert.ok(p.height <= MAX_HEIGHT, `${rounds}x${per}: page ${p.number} is ${p.height}px`);
      const chrome = (p.first ? SIZE.header : SIZE.slimHeader) + SIZE.footer;
      assert.equal(p.height, chrome + p.blocks.reduce((s, b) => s + blockHeight(b), 0));
    }
  }
});

test("rounds that fit on an image are never cut in half", () => {
  const seen = new Map<number, number>();
  for (const p of paginate(tournament(11, 3))) {
    for (const b of p.blocks) {
      assert.equal(b.continued, false, "round " + b.roundN + " was split although it fits");
      seen.set(b.roundN, (seen.get(b.roundN) ?? 0) + 1);
    }
  }
  for (const [round, times] of seen) assert.equal(times, 1, "round " + round + " appears " + times + " times");
});

test("pages are balanced: seven rounds are 4 and 3, never 6 and 1", () => {
  const pages = paginate(tournament(7, 2));
  const counts = pages.map((p) => p.blocks.length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, "uneven split: " + counts.join(" / "));
});

test("balancing never adds an image", () => {
  for (const rounds of [4, 5, 6, 7, 9, 12, 15]) {
    const balanced = paginate(tournament(rounds, 2)).length;
    // The greedy count is what fits at the maximum height.
    const tallest = Math.ceil(
      (SIZE.header + SIZE.footer + rounds * (SIZE.roundHeading + 2 * (SIZE.match + SIZE.matchGap) + SIZE.roundGap)) /
        (MAX_HEIGHT - SIZE.slimHeader - SIZE.footer),
    );
    assert.ok(balanced <= tallest + 1, `${rounds} rounds gave ${balanced} images`);
  }
});

test("page numbers, totals and round ranges are consistent", () => {
  const pages = paginate(tournament(9, 2));
  pages.forEach((p, i) => {
    assert.equal(p.number, i + 1);
    assert.equal(p.total, pages.length);
    assert.equal(p.first, i === 0);
  });
  assert.equal(pages[0].fromRound, 1);
  assert.equal(pages[pages.length - 1].toRound, 9);
  for (let i = 1; i < pages.length; i++) {
    assert.equal(pages[i].fromRound, pages[i - 1].toRound + 1, "rounds must run on from one image to the next");
  }
});

test("a round taller than an image is split, and the continuation is marked", () => {
  const t = tournament(1, 14);
  const pages = paginate(t);

  assert.ok(pages.length > 1, "14 matches cannot fit on one image");
  assert.deepEqual(idsOf(pages), t.rounds[0].matches.map((m) => m.id), "no match lost or repeated");
  assert.equal(pages[0].blocks[0].continued, false);
  for (const p of pages.slice(1)) assert.equal(p.blocks[0].continued, true, "later parts are marked as continued");
  for (const p of pages) assert.ok(p.height <= MAX_HEIGHT);
});

test("who is resting costs no height: it rides on the round heading", () => {
  const plain = paginate(tournament(1, 2));
  const withByes = paginate(tournament(1, 2, ["p9", "p10"]));
  assert.equal(plain[0].height, withByes[0].height, "a resting line must not change the layout");
  assert.equal(
    blockHeight(withByes[0].blocks[0]),
    SIZE.roundHeading + 2 * (SIZE.match + SIZE.matchGap) + SIZE.roundGap,
  );
});

test("matches within a round are listed by court", () => {
  const t = tournament(1, 3);
  t.rounds[0].matches.reverse(); // stored out of order
  const courts = paginate(t)[0].blocks[0].matches.map((m) => m.court);
  assert.deepEqual(courts, [1, 2, 3]);
});

test("a tournament with no rounds yields one empty image rather than none", () => {
  const pages = paginate(tournament(0, 2));
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].blocks, []);
  assert.equal(pages[0].fromRound, 0);
});

test("the revision changes when a round is drawn or a score is entered, and not otherwise", () => {
  const t = tournament(2, 2);
  const before = revision(t);
  assert.equal(revision(t), before, "stable when nothing changes");

  t.rounds[0].matches[0].scoreA = 16;
  t.rounds[0].matches[0].scoreB = 8;
  const scored = revision(t);
  assert.notEqual(scored, before, "entering a score must bust the cache");

  t.rounds.push({ n: 3, matches: [match(1), match(2)], byes: [] });
  assert.notEqual(revision(t), scored, "drawing a round must bust the cache");
});
