import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_CLUB, type Club, type Tournament } from "../src/app/padel/core/types.ts";
import { apply, type Action, type Env } from "../src/app/padel/core/actions.ts";
import { americanoSchedule, rngFromSeed, suggestedRounds, teamRounds } from "../src/app/padel/core/schedule.ts";
import { clubRanking, placings, standings } from "../src/app/padel/core/standings.ts";

function env(seed = 1): Env {
  let n = 0;
  return { rng: rngFromSeed(seed), newId: () => "id" + ++n, now: () => "2026-09-29T20:00:00.000Z" };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => "P" + (i + 1));

function create(club: Club, action: Partial<Extract<Action, { type: "createTournament" }>>, e = env()) {
  const r = apply(
    club,
    {
      type: "createTournament",
      name: "",
      format: "americano",
      scoring: { kind: "points", total: 24 },
      courts: 2,
      rounds: 7,
      players: names(8),
      ...action,
    },
    e,
  );
  assert.ok(r.ok, "create failed: " + JSON.stringify(r));
  if (!r.ok) throw new Error();
  return r.club;
}

/** Scores every match so that the side with the lower-numbered player wins 16–8. */
function scoreAll(club: Club, t: Tournament, e = env()): Club {
  let c = club;
  for (const r of t.rounds) {
    for (const m of r.matches) {
      const aBest = Math.min(...m.a.map((id) => c.players.findIndex((p) => p.id === id)));
      const bBest = Math.min(...m.b.map((id) => c.players.findIndex((p) => p.id === id)));
      const res = apply(
        c,
        { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: aBest < bBest ? 16 : 8, scoreB: aBest < bBest ? 8 : 16 },
        e,
      );
      assert.ok(res.ok);
      if (res.ok) c = res.club;
    }
  }
  return c;
}

/* ── Americano draw ───────────────────────────────────────── */

test("8 players over 7 rounds: everyone partners everyone exactly once", () => {
  const ids = names(8);
  let n = 0;
  const rounds = americanoSchedule(ids, 2, 7, rngFromSeed(7), () => "m" + ++n);
  const partners = new Map<string, number>();
  for (const r of rounds) {
    assert.equal(r.matches.length, 2);
    assert.equal(r.byes.length, 0);
    const seen = new Set(r.matches.flatMap((m) => [...m.a, ...m.b]));
    assert.equal(seen.size, 8, "a player is on two courts at once");
    for (const m of r.matches) {
      for (const p of [m.a, m.b]) {
        const k = [...p].sort().join("|");
        partners.set(k, (partners.get(k) ?? 0) + 1);
      }
    }
  }
  assert.equal(partners.size, 28, "every one of the 28 possible partnerships happens");
  assert.ok([...partners.values()].every((v) => v === 1));
});

test("an uneven field shares the sitting out and ends level", () => {
  // 10 players, 2 courts: 2 sit out each round. The suggested length gives
  // everyone the same number of matches.
  const rounds = suggestedRounds(10, 2);
  assert.equal((rounds * 8) % 10, 0);
  let n = 0;
  const schedule = americanoSchedule(names(10), 2, rounds, rngFromSeed(3), () => "m" + ++n);
  // Start everyone at zero, so someone who never gets on court is noticed.
  const played = new Map<string, number>(names(10).map((id) => [id, 0]));
  for (const r of schedule) {
    assert.equal(r.byes.length, 2);
    for (const m of r.matches) for (const id of [...m.a, ...m.b]) played.set(id, (played.get(id) ?? 0) + 1);
  }
  assert.equal(new Set(played.values()).size, 1, "matches played: " + JSON.stringify([...played]));
});

test("5 players on one court: each sits out once and partners the other four", () => {
  let n = 0;
  const schedule = americanoSchedule(names(5), 1, 5, rngFromSeed(11), () => "m" + ++n);
  const rests = schedule.flatMap((r) => r.byes).sort();
  assert.deepEqual(rests, names(5).sort());
  const partners = new Set(schedule.flatMap((r) => r.matches.flatMap((m) => [m.a, m.b].map((p) => [...p].sort().join("|")))));
  assert.equal(partners.size, 10);
});

test("a big field still draws quickly", () => {
  const start = Date.now();
  let n = 0;
  americanoSchedule(names(40), 10, 20, rngFromSeed(9), () => "m" + ++n);
  assert.ok(Date.now() - start < 5000, "took " + (Date.now() - start) + "ms");
});

/* ── scores ───────────────────────────────────────────────── */

test("points scoring insists the two sides add up to the total", () => {
  const club = create(EMPTY_CLUB, {});
  const t = club.tournaments[0];
  const m = t.rounds[0].matches[0];
  const bad = apply(club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: 15, scoreB: 8 }, env());
  assert.deepEqual(bad, { ok: false, error: "badScore" });
  const good = apply(club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: 15, scoreB: 9 }, env());
  assert.ok(good.ok);
  const cleared = good.ok && apply(good.club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: null, scoreB: null }, env());
  assert.ok(cleared && cleared.ok);
  if (cleared && cleared.ok) assert.equal(cleared.club.tournaments[0].rounds[0].matches[0].scoreA, null);
});

test("each player collects the points their side scored", () => {
  let club = create(EMPTY_CLUB, {});
  const t = club.tournaments[0];
  const m = t.rounds[0].matches[0];
  const r = apply(club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: 17, scoreB: 7 }, env());
  assert.ok(r.ok);
  if (r.ok) club = r.club;
  const lines = standings(club.tournaments[0]).lines;
  const line = (id: string) => lines.find((l) => l.key === id)!;
  assert.equal(line(m.a[0]).pointsFor, 17);
  assert.equal(line(m.a[1]).won, 1);
  assert.equal(line(m.b[0]).pointsFor, 7);
  assert.equal(line(m.b[1]).lost, 1);
  assert.equal(lines[0].pointsFor, 17);
});

test("names are matched to existing players, whatever the case", () => {
  const first = create(EMPTY_CLUB, {});
  const second = create(first, { players: ["p1", "P2 ", "p3", "New"] , courts: 1, rounds: 3 }, env(2));
  assert.equal(second.players.length, 9);
  const dup = apply(first, { type: "createTournament", name: "", format: "americano", scoring: { kind: "games" }, courts: 1, rounds: 3, players: ["A", "B", "C", "a"] }, env());
  assert.deepEqual(dup, { ok: false, error: "duplicatePlayer" });
});

/* ── formats ──────────────────────────────────────────────── */

test("Mexicano draws the next round from the table: 1st+4th vs 2nd+3rd", () => {
  let club = create(EMPTY_CLUB, { format: "mexicano", rounds: 5 });
  const id = club.tournaments[0].id;
  assert.equal(club.tournaments[0].rounds.length, 1);

  const early = apply(club, { type: "nextRound", tournamentId: id }, env());
  assert.deepEqual(early, { ok: false, error: "roundIncomplete" });

  club = scoreAll(club, club.tournaments[0]);
  const r = apply(club, { type: "nextRound", tournamentId: id }, env(5));
  assert.ok(r.ok);
  if (!r.ok) return;
  const t = r.club.tournaments[0];
  const table = standings({ ...t, rounds: t.rounds.slice(0, 1) }).lines.map((l) => l.key);
  const court1 = t.rounds[1].matches[0];
  assert.deepEqual([...court1.a, ...court1.b], [table[0], table[3], table[1], table[2]]);
});

test("fixed teams: a full round robin, ranked by wins", () => {
  let club = create(EMPTY_CLUB, { format: "teams", players: names(8), courts: 2, scoring: { kind: "games" } });
  const t = club.tournaments[0];
  assert.equal(t.teams?.length, 4);
  assert.equal(t.rounds.length, teamRounds(4, 2));
  const meetings = new Set<string>();
  for (const r of t.rounds) for (const m of r.matches) meetings.add([m.a.join("+"), m.b.join("+")].sort().join(" v "));
  assert.equal(meetings.size, 6, "every team meets every other once");

  club = scoreAll(club, t);
  const top = standings(club.tournaments[0]).lines[0];
  assert.equal(top.won, 3);
  assert.equal(top.key, club.players[0].id + "|" + club.players[1].id);
});

/* ── club ranking ─────────────────────────────────────────── */

test("the ranking counts finished tournaments only, by finishing place", () => {
  let club = create(EMPTY_CLUB, {});
  club = scoreAll(club, club.tournaments[0]);
  assert.equal(clubRanking(club).length, 0, "an unfinished tournament doesn't count yet");

  const done = apply(club, { type: "finish", tournamentId: club.tournaments[0].id }, env());
  assert.ok(done.ok);
  if (!done.ok) return;
  const ranking = clubRanking(done.club);
  const places = placings(done.club.tournaments[0]);
  assert.equal(ranking.length, 8);
  assert.equal(ranking[0].points, 8, "winner of an 8-player field earns 8");
  assert.equal(ranking[7].points, 1, "last still earns 1");
  assert.equal(places.get(ranking[0].playerId), 1);
  assert.equal(ranking[0].titles, 1);
  assert.equal(ranking[0].playerId, done.club.players[0].id, "P1 won every match");
});

test("correcting a score after the end moves the ranking", () => {
  let club = create(EMPTY_CLUB, { courts: 1, rounds: 1, players: names(4) });
  const t = club.tournaments[0];
  const m = t.rounds[0].matches[0];
  const set = (a: number, b: number) => {
    const r = apply(club, { type: "setScore", tournamentId: t.id, matchId: m.id, scoreA: a, scoreB: b }, env());
    assert.ok(r.ok);
    if (r.ok) club = r.club;
  };
  set(20, 4);
  const fin = apply(club, { type: "finish", tournamentId: t.id }, env());
  if (fin.ok) club = fin.club;
  assert.ok(m.a.includes(clubRanking(club)[0].playerId));
  set(4, 20);
  assert.ok(m.b.includes(clubRanking(club)[0].playerId));
});
