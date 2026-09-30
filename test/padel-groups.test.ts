import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_CLUB, type Club, type Tournament } from "../src/app/padel/core/types.ts";
import { apply, type Action, type Env } from "../src/app/padel/core/actions.ts";
import { rngFromSeed, groupStageRounds, groupsSchedule } from "../src/app/padel/core/schedule.ts";
import { clubRanking, groupTable, placings, standings } from "../src/app/padel/core/standings.ts";
import { defaultShape, groupShapes, groupSizes, nextKnockout } from "../src/app/padel/core/groups.ts";

function env(seed = 1): Env {
  let n = 0;
  return { rng: rngFromSeed(seed), newId: () => "id" + ++n, now: () => "2026-09-30T20:00:00.000Z" };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => "P" + (i + 1));

function ok(r: ReturnType<typeof apply>): Club {
  assert.ok(r.ok, "action failed: " + JSON.stringify(r));
  if (!r.ok) throw new Error();
  return r.club;
}

function createGroups(pairs: number, groups = 2, qualifiers = 2, e = env()): Club {
  const action: Action = {
    type: "createTournament",
    name: "",
    format: "groups",
    scoring: { kind: "points", total: 24 },
    courts: 3,
    rounds: 0,
    players: names(pairs * 2),
    groups,
    qualifiers,
  };
  return ok(apply(EMPTY_CLUB, action, e));
}

/** The pair holding the lower-numbered player wins 16–8. */
function strength(club: Club, pair: readonly string[]) {
  return Math.min(...pair.map((id) => club.players.findIndex((p) => p.id === id)));
}

function scoreRound(club: Club, pick: (t: Tournament) => { id: string; a: string[]; b: string[] }[]): Club {
  let c = club;
  const t = c.tournaments[0];
  for (const m of pick(t)) {
    const aWins = strength(c, m.a) < strength(c, m.b);
    c = ok(apply(c, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: aWins ? 16 : 8, scoreB: aWins ? 8 : 16 }, env()));
  }
  return c;
}

const groupMatches = (t: Tournament) => t.rounds.filter((r) => !r.ko).flatMap((r) => r.matches);
const koRound = (t: Tournament, ko: number) => t.rounds.find((r) => r.ko === ko);

/* ── shapes ───────────────────────────────────────────────── */

test("12 pairs default to two groups of six with semi-finals", () => {
  assert.deepEqual(defaultShape(12), { groups: 2, qualifiers: 2 });
  assert.deepEqual(groupSizes(12, 2), [6, 6]);
  assert.deepEqual(groupSizes(7, 2), [4, 3]);
  // Too few pairs for two groups of three: one group, the top two in a final.
  assert.deepEqual(defaultShape(4), { groups: 1, qualifiers: 2 });
  assert.equal(defaultShape(2), null);
  assert.ok(groupShapes(12).some((s) => s.groups === 4 && s.qualifiers === 2), "quarter-finals on offer");
  assert.ok(!groupShapes(10).some((s) => s.groups === 4 && s.qualifiers === 2), "groups of two can't send two through");
});

test("an impossible shape is refused", () => {
  const r = apply(
    EMPTY_CLUB,
    { type: "createTournament", name: "", format: "groups", scoring: { kind: "games" }, courts: 2, rounds: 0, players: names(8), groups: 4, qualifiers: 2 },
    env(),
  );
  assert.deepEqual(r, { ok: false, error: "badGroups" });
});

/* ── group stage ──────────────────────────────────────────── */

test("group stage: a round robin inside each group, nobody on two courts", () => {
  const club = createGroups(12);
  const t = club.tournaments[0];
  assert.equal(t.groups?.length, 2);
  assert.deepEqual(t.groups?.map((g) => g.length), [6, 6]);
  assert.equal(t.name, "Grupos 30/09");

  const inGroup = new Map(t.groups!.flatMap((g, gi) => g.map((p) => [p.join("|"), gi])));
  const meetings = new Set<string>();
  for (const r of t.rounds) {
    assert.equal(r.ko, undefined, "no knockout before the groups are played");
    assert.ok(r.matches.length <= 3, "no more matches than courts");
    const onCourt = r.matches.flatMap((m) => [...m.a, ...m.b]);
    assert.equal(new Set(onCourt).size, onCourt.length, "a player is on two courts at once");
    for (const m of r.matches) {
      assert.equal(inGroup.get(m.a.join("|")), m.group);
      assert.equal(inGroup.get(m.b.join("|")), m.group);
      meetings.add([m.a.join("+"), m.b.join("+")].sort().join(" v "));
    }
  }
  assert.equal(meetings.size, 2 * 15, "every pair meets every pair in its group once");
  assert.equal(groupMatches(t).length, 30);
  assert.equal(t.plannedRounds, t.rounds.length + 2, "semi-finals and final still to come");
});

test("the predicted number of group rounds matches the draw", () => {
  for (const [sizes, courts] of [[[6, 6], 3], [[4, 3], 2], [[3, 3, 3, 3], 4], [[5], 1], [[6, 5], 4]] as [number[], number][]) {
    let n = 0;
    const groups = sizes.map((s, g) => Array.from({ length: s }, (_, i) => [`g${g}p${i}a`, `g${g}p${i}b`] as [string, string]));
    const rounds = groupsSchedule(groups, courts, rngFromSeed(3), () => "m" + ++n);
    assert.equal(rounds.length, groupStageRounds(sizes, courts), `sizes ${sizes} on ${courts} courts`);
  }
});

/* ── knockout ─────────────────────────────────────────────── */

test("the semi-finals appear with the last group score: A1 v B2, B1 v A2", () => {
  let club = createGroups(12);
  const firstMatches = groupMatches(club.tournaments[0]);
  club = scoreRound(club, () => firstMatches.slice(0, -1));
  assert.equal(koRound(club.tournaments[0], 4), undefined, "not while a group match is missing");
  assert.equal(nextKnockout(club.tournaments[0]), 4);

  club = scoreRound(club, () => firstMatches.slice(-1));
  const t = club.tournaments[0];
  const semis = koRound(t, 4);
  assert.ok(semis, "semi-finals drawn");
  assert.equal(semis.n, t.rounds.length);
  assert.deepEqual(semis.byes, []);
  const [a, b] = [groupTable(t, 0), groupTable(t, 1)].map((table) => table.map((l) => l.ids.join("|")));
  assert.deepEqual(semis.matches.map((m) => [m.a.join("|"), m.b.join("|")]), [
    [a[0], b[1]],
    [b[0], a[1]],
  ]);
  assert.equal(nextKnockout(t), 2);
});

test("a knockout match cannot end level", () => {
  let club = createGroups(6);
  club = scoreRound(club, groupMatches);
  const t = club.tournaments[0];
  const semi = koRound(t, 4)!.matches[0];
  const r = apply(club, { type: "setScore", tournamentId: t.id, matchId: semi.id, scoreA: 12, scoreB: 12 }, env());
  assert.deepEqual(r, { ok: false, error: "needWinner" });
});

test("the final follows the semis, and the table ends champion, runner-up, semi-finalists", () => {
  let club = createGroups(12);
  club = scoreRound(club, groupMatches);
  club = scoreRound(club, (t) => koRound(t, 4)!.matches);
  const final = koRound(club.tournaments[0], 2);
  assert.ok(final, "final drawn");
  assert.equal(final.matches.length, 1);
  assert.equal(club.tournaments[0].rounds.length, club.tournaments[0].plannedRounds);

  club = scoreRound(club, (t) => koRound(t, 2)!.matches);
  const t = club.tournaments[0];
  const lines = standings(t).lines;
  assert.equal(lines.length, 12);
  // P1 and P2 are the strongest pair, so they win everything.
  assert.equal(lines[0].key, club.players[0].id + "|" + club.players[1].id);
  const finalists = [...final.matches[0].a, ...final.matches[0].b].sort();
  assert.deepEqual([...lines[0].ids, ...lines[1].ids].sort(), finalists);
  const semis = koRound(t, 4)!.matches.flatMap((m) => [m.a.join("|"), m.b.join("|")]);
  assert.deepEqual(new Set(lines.slice(0, 4).map((l) => l.key)), new Set(semis));

  const done = ok(apply(club, { type: "finish", tournamentId: t.id }, env()));
  const places = placings(done.tournaments[0]);
  assert.equal(places.get(club.players[0].id), 1);
  assert.equal(places.get(club.players[1].id), 1, "both partners share the title");
  const ranking = clubRanking(done);
  assert.equal(ranking[0].titles, 1);
  assert.equal(ranking[0].points, 24, "winner of a 24-player field earns 24");
});

test("until a knockout score is in, fixing a group score redraws the bracket", () => {
  let club = createGroups(6);
  club = scoreRound(club, groupMatches);
  const t = club.tournaments[0];
  const before = koRound(t, 4)!;

  // Flip a group-A match between its top two so the order in the group swaps.
  const [first, second] = groupTable(t, 0);
  const decider = groupMatches(t).find((m) =>
    [m.a.join("|"), m.b.join("|")].sort().join() === [first.key, second.key].sort().join(),
  )!;
  const flip = (c: Club) =>
    ok(apply(c, { type: "setScore", tournamentId: t.id, matchId: decider.id, scoreA: decider.scoreA === 16 ? 0 : 24, scoreB: decider.scoreA === 16 ? 24 : 0 }, env()));
  const after = flip(club).tournaments[0];
  const redrawn = koRound(after, 4)!;
  assert.notDeepEqual(redrawn.matches.map((m) => m.a), before.matches.map((m) => m.a), "the new group winner is seeded first");
  assert.deepEqual(redrawn.matches.map((m) => m.id), before.matches.map((m) => m.id), "match ids stay put");

  // Once a semi-final has a score, the bracket stays as it was played.
  club = scoreRound(club, (x) => koRound(x, 4)!.matches.slice(0, 1));
  const locked = flip(club).tournaments[0];
  assert.deepEqual(koRound(locked, 4)!.matches.map((m) => m.a), before.matches.map((m) => m.a));
});

test("clearing a group score takes back a knockout round nobody has played", () => {
  let club = createGroups(6);
  club = scoreRound(club, groupMatches);
  const t = club.tournaments[0];
  const m = groupMatches(t)[0];
  club = ok(apply(club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: null, scoreB: null }, env()));
  assert.equal(koRound(club.tournaments[0], 4), undefined);
  assert.equal(club.tournaments[0].rounds.length, t.rounds.length - 1);
});

test("four groups with two through play quarter-finals, groups kept apart until the final", () => {
  let club = createGroups(12, 4, 2);
  club = scoreRound(club, groupMatches);
  const t = club.tournaments[0];
  const qf = koRound(t, 8)!;
  assert.equal(qf.matches.length, 4);
  const groupOf = new Map(t.groups!.flatMap((g, gi) => g.map((p) => [p.join("|"), gi])));
  // Matches 0–1 feed one semi-final, 2–3 the other: each group has one pair per half.
  const half = (ms: typeof qf.matches) => ms.flatMap((m) => [groupOf.get(m.a.join("|")), groupOf.get(m.b.join("|"))]).sort();
  assert.deepEqual(half(qf.matches.slice(0, 2)), [0, 1, 2, 3]);
  assert.deepEqual(half(qf.matches.slice(2)), [0, 1, 2, 3]);
});

/* ── merging players ──────────────────────────────────────── */

test("merging a mistyped player moves their matches and removes the duplicate", () => {
  const e = env();
  let club = ok(
    apply(EMPTY_CLUB, { type: "createTournament", name: "", format: "americano", scoring: { kind: "points", total: 24 }, courts: 1, rounds: 3, players: ["João", "Ana", "Rui", "Rita"] }, e),
  );
  club = ok(
    apply(club, { type: "createTournament", name: "", format: "americano", scoring: { kind: "points", total: 24 }, courts: 1, rounds: 3, players: ["Joao Silva", "Ana", "Rui", "Rita"] }, e),
  );
  const joao = club.players.find((p) => p.name === "João")!;
  const typo = club.players.find((p) => p.name === "Joao Silva")!;

  const clash = apply(club, { type: "mergePlayers", fromId: typo.id, intoId: "nobody" }, e);
  assert.deepEqual(clash, { ok: false, error: "notFound" });

  const merged = ok(apply(club, { type: "mergePlayers", fromId: typo.id, intoId: joao.id }, e));
  assert.equal(merged.players.length, 4);
  assert.ok(!merged.players.some((p) => p.id === typo.id));
  const second = merged.tournaments[0];
  assert.ok(second.playerIds.includes(joao.id));
  assert.ok(second.rounds.every((r) => r.matches.every((m) => ![...m.a, ...m.b].includes(typo.id))));

  // Ana played in both tournaments with João: they cannot be one person.
  const ana = club.players.find((p) => p.name === "Ana")!;
  assert.deepEqual(apply(merged, { type: "mergePlayers", fromId: ana.id, intoId: joao.id }, e), { ok: false, error: "sameTournament" });
});

test("renaming keeps the player, their matches and their ranking", () => {
  const e = env();
  let club = ok(
    apply(EMPTY_CLUB, { type: "createTournament", name: "", format: "americano", scoring: { kind: "points", total: 24 }, courts: 1, rounds: 3, players: ["Joao", "Ana", "Rui", "Rita"] }, e),
  );
  const id = club.players[0].id;
  club = ok(apply(club, { type: "renamePlayer", playerId: id, name: "  João  Silva " }, e));
  assert.equal(club.players[0].id, id);
  assert.equal(club.players[0].name, "João Silva");
  assert.ok(club.tournaments[0].playerIds.includes(id));
  assert.deepEqual(apply(club, { type: "renamePlayer", playerId: id, name: "ana" }, e), { ok: false, error: "nameTaken" });
});
