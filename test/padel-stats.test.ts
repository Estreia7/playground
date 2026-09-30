import { test } from "node:test";
import assert from "node:assert/strict";
import type { Club, Match, Round, Tournament } from "../src/app/padel/core/types.ts";
import {
  playerStats,
  highlights,
  playersWithStats,
  tallyWinRate,
  MIN_SHARED_MATCHES,
} from "../src/app/padel/core/playerStats.ts";

/* The statistics are derived, never stored, so these tests build small clubs by
   hand and assert on what comes out. The partner and opponent tables are the
   part worth pinning: they are what the page is for, and an off-by-one in
   which side a player was on would quietly credit the wrong person. */

let matchCounter = 0;

/** One scored match: `a` beat or lost to `b` by the given score. */
function match(a: [string, string], b: [string, string], scoreA: number, scoreB: number): Match {
  return { id: "m" + ++matchCounter, court: 1, a, b, scoreA, scoreB };
}

function round(n: number, matches: Match[], byes: string[] = []): Round {
  return { n, matches, byes };
}

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "Friday",
    format: "americano",
    scoring: { kind: "points", total: 24 },
    courts: 1,
    playerIds: ["ana", "bea", "caio", "dani"],
    plannedRounds: 1,
    rounds: [],
    status: "finished",
    createdAt: "2026-01-01T10:00:00.000Z",
    finishedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

function club(tournaments: Tournament[], playerIds: string[] = []): Club {
  const ids = new Set(playerIds);
  for (const t of tournaments) for (const id of t.playerIds) ids.add(id);
  return {
    version: 1,
    players: [...ids].map((id) => ({ id, name: id.toUpperCase(), createdAt: "2026-01-01T00:00:00.000Z" })),
    tournaments,
  };
}

test("a win is credited to both players on the winning side", () => {
  const c = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)])],
    }),
  ]);

  for (const winner of ["ana", "bea"]) {
    const s = playerStats(c, winner);
    assert.equal(s.total.played, 1, winner + " played one match");
    assert.equal(s.total.won, 1);
    assert.equal(s.total.pointsFor, 16);
    assert.equal(s.total.pointsAgainst, 8);
  }
  for (const loser of ["caio", "dani"]) {
    const s = playerStats(c, loser);
    assert.equal(s.total.lost, 1);
    assert.equal(s.total.pointsFor, 8, loser + " scored the losing side's points");
    assert.equal(s.total.pointsAgainst, 16);
  }
});

test("partners and opponents land on the right side of the net", () => {
  const c = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)])],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.deepEqual(
    s.partners.map((p) => p.playerId),
    ["bea"],
    "only the player on the same side is a partner",
  );
  assert.deepEqual(
    s.opponents.map((p) => p.playerId).sort(),
    ["caio", "dani"],
    "both players across the net are opponents",
  );
  assert.ok(!s.partners.some((p) => p.playerId === "ana"), "a player is never their own partner");
});

test("a player's own record and their partner's record agree when they always play together", () => {
  const c = club([
    tournament({
      plannedRounds: 2,
      rounds: [
        round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
        round(2, [match(["ana", "bea"], ["caio", "dani"], 10, 14)]),
      ],
    }),
  ]);

  const ana = playerStats(c, "ana");
  const withBea = ana.partners.find((p) => p.playerId === "bea");
  assert.ok(withBea);
  assert.equal(withBea.played, ana.total.played, "every match was played alongside bea");
  assert.equal(withBea.won, ana.total.won);
  assert.equal(withBea.lost, ana.total.lost);
});

test("unfinished tournaments are ignored", () => {
  const c = club([
    tournament({
      id: "done",
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)])],
    }),
    tournament({
      id: "live",
      status: "active",
      finishedAt: undefined,
      rounds: [round(1, [match(["ana", "caio"], ["bea", "dani"], 20, 4)])],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.equal(s.total.played, 1, "only the finished tournament counts");
  assert.equal(s.tournaments, 1);
  assert.deepEqual(s.partners.map((p) => p.playerId), ["bea"], "the live tournament's partner is absent");
});

test("matches with no score yet are skipped", () => {
  const unscored: Match = { id: "m0", court: 1, a: ["ana", "bea"], b: ["caio", "dani"], scoreA: null, scoreB: null };
  const c = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8), unscored])],
    }),
  ]);

  assert.equal(playerStats(c, "ana").total.played, 1);
});

test("a draw counts as neither a win nor a loss", () => {
  const c = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 12, 12)])],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.equal(s.total.drawn, 1);
  assert.equal(s.total.won, 0);
  assert.equal(s.total.lost, 0);
  assert.equal(tallyWinRate(s.total), 0, "a draw is not half a win");
});

test("streaks count runs and a draw breaks them without starting one", () => {
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]), // W
    round(2, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]), // W
    round(3, [match(["ana", "dani"], ["bea", "caio"], 12, 12)]), // D
    round(4, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]), // L
    round(5, [match(["ana", "caio"], ["bea", "dani"], 6, 18)]), // L
    round(6, [match(["ana", "dani"], ["bea", "caio"], 5, 19)]), // L
  ];
  const c = club([tournament({ plannedRounds: 6, rounds })]);
  const s = playerStats(c, "ana");

  assert.equal(s.longestWinStreak, 2);
  assert.equal(s.longestLossStreak, 3);
  assert.equal(s.currentStreak, -3, "three losses running reads as minus three");
  assert.deepEqual(s.recentForm.slice(0, 3), ["L", "L", "L"], "recent form is newest first");
});

test("a current winning streak is positive and a draw ends on zero", () => {
  const winning = club([
    tournament({
      plannedRounds: 2,
      rounds: [
        round(1, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
        round(2, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
      ],
    }),
  ]);
  assert.equal(playerStats(winning, "ana").currentStreak, 1);

  const drawn = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 12, 12)])],
    }),
  ]);
  assert.equal(playerStats(drawn, "ana").currentStreak, 0, "a draw leaves no streak running");
});

test("per-match averages make players with different match counts comparable", () => {
  const c = club([
    tournament({
      plannedRounds: 2,
      rounds: [
        round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
        round(2, [match(["ana", "bea"], ["caio", "dani"], 14, 10)]),
      ],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.equal(s.pointsForPerMatch, 15, "(16 + 14) / 2");
  assert.equal(s.pointsAgainstPerMatch, 9, "(8 + 10) / 2");
});

test("finishing places, titles and the tournament history are recorded", () => {
  // Ana and Bea win every match, so they finish above Caio and Dani.
  const c = club([
    tournament({
      id: "t1",
      name: "January",
      finishedAt: "2026-01-10T12:00:00.000Z",
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 20, 4)])],
    }),
    tournament({
      id: "t2",
      name: "February",
      finishedAt: "2026-02-10T12:00:00.000Z",
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 2, 22)])],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.equal(s.tournaments, 2);
  assert.equal(s.titles, 1, "won January, lost February");
  assert.equal(s.bestPlace, 1);
  assert.ok(s.worstPlace !== null && s.worstPlace > 1);
  assert.deepEqual(
    s.history.map((h) => h.name),
    ["February", "January"],
    "history is newest first",
  );
  assert.equal(s.history[1].won, 1, "January is recorded as a win");
  assert.equal(s.history[0].lost, 1, "February is recorded as a loss");
  assert.equal(s.history[0].field, 4);
});

test("the best partner is the one with the highest win rate, not the most wins", () => {
  /* Bea: 4 played, 2 won (50%). Caio: 3 played, 3 won (100%).
     Counting wins alone would name Bea; the rate is what matters. */
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(2, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(3, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(4, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(5, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
    round(6, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
    round(7, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
  ];
  const c = club([tournament({ plannedRounds: 7, rounds })]);
  const h = highlights(playerStats(c, "ana"));

  assert.equal(h.bestPartner?.playerId, "caio");
  assert.equal(h.bestPartner?.rate, 1);
  assert.equal(h.worstPartner?.playerId, "bea");
  assert.equal(h.worstPartner?.rate, 0.5);
});

test("the nemesis is the opponent with the best record against this player", () => {
  /* Ana always partners Bea. Caio's side wins three of four; Dani only plays
     the one match that Ana wins. */
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "eve"], 4, 20)]),
    round(2, [match(["ana", "bea"], ["caio", "eve"], 4, 20)]),
    round(3, [match(["ana", "bea"], ["caio", "eve"], 4, 20)]),
    round(4, [match(["ana", "bea"], ["dani", "fay"], 20, 4)]),
  ];
  const c = club([
    tournament({
      playerIds: ["ana", "bea", "caio", "dani", "eve", "fay"],
      plannedRounds: 4,
      rounds,
    }),
  ]);

  const h = highlights(playerStats(c, "ana"));
  assert.ok(
    h.nemesis?.playerId === "caio" || h.nemesis?.playerId === "eve",
    "the nemesis is one of the pair that kept winning, got " + h.nemesis?.playerId,
  );
  assert.equal(h.nemesis?.rate, 0, "ana never beat them");
  assert.equal(h.nemesis?.played, 3);
});

test("a single partner is not reported as both the best and the worst", () => {
  const c = club([
    tournament({
      format: "teams",
      teams: [["ana", "bea"], ["caio", "dani"]],
      plannedRounds: 2,
      rounds: [
        round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
        round(2, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
      ],
    }),
  ]);

  /* With one partner there is no comparison to make. Reporting them as both
     the best and the worst would be a lie in one of the two places, so only
     the losing reading survives — that is the one that carries advice. */
  const h = highlights(playerStats(c, "ana"));
  assert.equal(h.bestPartner, null, "a sole partner is not a 'best' one");
  assert.equal(h.worstPartner?.playerId, "bea");
  assert.equal(h.worstPartner?.played, 2);
});

test("the threshold relaxes so a small club still gets an answer", () => {
  // One match together is below MIN_SHARED_MATCHES, but it is all there is.
  const c = club([
    tournament({
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)])],
    }),
  ]);

  assert.ok(MIN_SHARED_MATCHES > 1, "the default threshold is meant to exclude one-offs");
  const h = highlights(playerStats(c, "ana"));

  // The single pairing is still reported rather than nothing, and it carries
  // its sample size so the UI can say it rests on one match.
  assert.equal(h.worstPartner?.playerId, "bea", "rather than nothing, it reports the one pairing");
  assert.equal(h.worstPartner?.played, 1, "and says the sample was a single match");

  // Both opponents were faced once and both were beaten, so their rates are
  // level and neither end of that table is a real claim.
  assert.equal(h.favouriteOpponent, null, "level rates are not a 'favourite'");
  assert.ok(h.nemesis, "but the pairing itself is still surfaced");
});

test("a player with no finished tournaments gets an empty, non-throwing record", () => {
  const c = club([], ["ghost"]);
  const s = playerStats(c, "ghost");

  assert.equal(s.total.played, 0);
  assert.equal(s.tournaments, 0);
  assert.equal(s.bestPlace, null);
  assert.equal(s.averagePlace, null);
  assert.equal(s.pointsForPerMatch, 0, "no division by zero");
  assert.deepEqual(s.partners, []);
  assert.deepEqual(s.recentForm, []);

  const h = highlights(s);
  assert.equal(h.bestPartner, null);
  assert.equal(h.nemesis, null);
});

test("the picker lists only players who appear in a finished tournament", () => {
  const c = club(
    [
      tournament({ playerIds: ["ana", "bea", "caio", "dani"], rounds: [] }),
      tournament({
        id: "live",
        status: "active",
        finishedAt: undefined,
        playerIds: ["eve", "fay", "gil", "hal"],
        rounds: [],
      }),
    ],
    ["never-played"],
  );

  const listed = playersWithStats(c).sort();
  assert.deepEqual(listed, ["ana", "bea", "caio", "dani"]);
  assert.ok(!listed.includes("eve"), "an active tournament's field is not listed");
  assert.ok(!listed.includes("never-played"));
});

test("a fixed-teams podium covers two places per step", () => {
  // Second place in a teams tournament is place 3, which still counts as a
  // podium because each team occupies two places.
  const c = club([
    tournament({
      format: "teams",
      teams: [["ana", "bea"], ["caio", "dani"]],
      rounds: [round(1, [match(["ana", "bea"], ["caio", "dani"], 4, 20)])],
    }),
  ]);

  const s = playerStats(c, "ana");
  assert.equal(s.history[0].place, 3, "the losing team holds places 3 and 4");
  assert.equal(s.podiums, 1, "which is still a podium in a teams tournament");
  assert.equal(s.titles, 0);
});

test("partner and opponent tables lead with the best record, not the most matches", () => {
  /* Bea: 4 played, 1 won (25%). Caio: 2 played, 2 won (100%).
     Ordering by matches played would put Bea on top, which reads as an answer
     to "who do I see most" rather than "who do I win with". */
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(2, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(3, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(4, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(5, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
    round(6, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
  ];
  const c = club([tournament({ plannedRounds: 6, rounds })]);
  const s = playerStats(c, "ana");

  assert.equal(s.partners[0].playerId, "caio", "the perfect record leads");
  assert.equal(s.partners[0].played, 2, "even on fewer matches");
  assert.equal(s.partners[1].playerId, "bea");
  assert.ok(
    tallyWinRate(s.partners[0]) > tallyWinRate(s.partners[1]),
    "the table is ordered by win rate",
  );
});

test("a tie on win rate is broken by the number of matches behind it", () => {
  // Both partners win every match; the one played more often ranks first.
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(2, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(3, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
  ];
  const c = club([tournament({ plannedRounds: 3, rounds })]);
  const s = playerStats(c, "ana");

  assert.equal(tallyWinRate(s.partners[0]), 1);
  assert.equal(tallyWinRate(s.partners[1]), 1);
  assert.equal(s.partners[0].playerId, "bea", "two wins together outrank one");
  assert.equal(s.partners[0].played, 2);
});

test("every partner and opponent carries the results against them, oldest first", () => {
  // Ana wins with Bea, then loses with Bea, then wins with Caio.
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(2, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
    round(3, [match(["ana", "caio"], ["bea", "dani"], 16, 8)]),
  ];
  const s = playerStats(club([tournament({ plannedRounds: 3, rounds })]), "ana");

  const bea = s.partners.find((p) => p.playerId === "bea");
  const caio = s.partners.find((p) => p.playerId === "caio");
  assert.deepEqual(bea?.results, ["W", "L"], "in the order they were played");
  assert.deepEqual(caio?.results, ["W"]);
  assert.equal(bea?.results.length, bea?.played, "one result per match together");

  // Bea was across the net in round 3, and Ana won that one.
  const beaAsOpponent = s.opponents.find((p) => p.playerId === "bea");
  assert.deepEqual(beaAsOpponent?.results, ["W"]);
});

test("the full match-by-match history is exposed for the form curve", () => {
  const rounds = [
    round(1, [match(["ana", "bea"], ["caio", "dani"], 16, 8)]),
    round(2, [match(["ana", "bea"], ["caio", "dani"], 12, 12)]),
    round(3, [match(["ana", "bea"], ["caio", "dani"], 4, 20)]),
  ];
  const s = playerStats(club([tournament({ plannedRounds: 3, rounds })]), "ana");

  assert.deepEqual(s.results, ["W", "D", "L"], "oldest first");
  assert.equal(s.results.length, s.total.played);
  assert.deepEqual(s.recentForm, ["L", "D", "W"], "recent form is the same list, newest first");
});
