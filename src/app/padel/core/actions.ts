import { LIMITS } from "./types.ts";
import type { Club, Format, Pair, Player, Scoring, Tournament } from "./types.ts";
import {
  americanoSchedule,
  maxCourts,
  mexicanoRound,
  shuffle,
  teamsSchedule,
  type Rng,
} from "./schedule.ts";
import { roundComplete, standings } from "./standings.ts";

/* Every change to the club goes through `apply`: the phone sends an action,
   the server applies it to the latest saved club and returns the result. Two
   people entering scores on different courts at once therefore never
   overwrite each other — each action lands on whatever the other just saved.

   Errors come back as short codes; the screen turns them into words. */

export type Action =
  | {
      type: "createTournament";
      name: string;
      format: Format;
      scoring: Scoring;
      courts: number;
      rounds: number;
      /** Player names in order. For fixed teams, consecutive names are
          partners: 1+2, 3+4, … */
      players: string[];
    }
  | { type: "setScore"; tournamentId: string; matchId: string; scoreA: number | null; scoreB: number | null }
  | { type: "nextRound"; tournamentId: string }
  | { type: "finish"; tournamentId: string }
  | { type: "reopen"; tournamentId: string }
  | { type: "deleteTournament"; tournamentId: string }
  | { type: "renamePlayer"; playerId: string; name: string };

export type ErrorCode =
  | "badRequest"
  | "notFound"
  | "tooFewPlayers"
  | "tooManyPlayers"
  | "duplicatePlayer"
  | "oddTeams"
  | "badCourts"
  | "badRounds"
  | "badScore"
  | "roundIncomplete"
  | "allRoundsPlayed"
  | "finished"
  | "nameTaken"
  | "badName";

export type Result = { ok: true; club: Club; id?: string } | { ok: false; error: ErrorCode };

export interface Env {
  rng: Rng;
  newId: () => string;
  now: () => string;
}

const fail = (error: ErrorCode): Result => ({ ok: false, error });

export const cleanName = (s: unknown) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxNameLength) : "";

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

function validScoring(s: unknown): Scoring | null {
  if (!s || typeof s !== "object") return null;
  const v = s as { kind?: unknown; total?: unknown };
  if (v.kind === "games") return { kind: "games" };
  if (v.kind === "points" && isInt(v.total) && v.total >= LIMITS.minPointsTotal && v.total <= LIMITS.maxPointsTotal) {
    return { kind: "points", total: v.total };
  }
  return null;
}

export function apply(club: Club, action: Action, env: Env): Result {
  if (!action || typeof action !== "object") return fail("badRequest");
  switch (action.type) {
    case "createTournament":
      return createTournament(club, action, env);
    case "setScore":
      return setScore(club, action);
    case "nextRound":
      return nextRound(club, action.tournamentId, env);
    case "finish":
    case "reopen": {
      const t = club.tournaments.find((x) => x.id === action.tournamentId);
      if (!t) return fail("notFound");
      const next: Tournament =
        action.type === "finish"
          ? { ...t, status: "finished", finishedAt: env.now() }
          : { ...t, status: "active", finishedAt: undefined };
      return { ok: true, club: replace(club, next) };
    }
    case "deleteTournament": {
      if (!club.tournaments.some((x) => x.id === action.tournamentId)) return fail("notFound");
      return { ok: true, club: { ...club, tournaments: club.tournaments.filter((x) => x.id !== action.tournamentId) } };
    }
    case "renamePlayer": {
      const name = cleanName(action.name);
      if (!name) return fail("badName");
      if (!club.players.some((p) => p.id === action.playerId)) return fail("notFound");
      if (club.players.some((p) => p.id !== action.playerId && sameName(p.name, name))) return fail("nameTaken");
      return {
        ok: true,
        club: { ...club, players: club.players.map((p) => (p.id === action.playerId ? { ...p, name } : p)) },
      };
    }
    default:
      return fail("badRequest");
  }
}

function replace(club: Club, t: Tournament): Club {
  return { ...club, tournaments: club.tournaments.map((x) => (x.id === t.id ? t : x)) };
}

function createTournament(club: Club, a: Extract<Action, { type: "createTournament" }>, env: Env): Result {
  if (a.format !== "americano" && a.format !== "mexicano" && a.format !== "teams") return fail("badRequest");
  const scoring = validScoring(a.scoring);
  if (!scoring) return fail("badScore");
  if (!Array.isArray(a.players)) return fail("badRequest");

  const names = a.players.map(cleanName).filter(Boolean);
  if (names.length < LIMITS.minPlayers) return fail("tooFewPlayers");
  if (names.length > LIMITS.maxPlayers) return fail("tooManyPlayers");
  for (let i = 0; i < names.length; i++) {
    if (names.slice(0, i).some((n) => sameName(n, names[i]))) return fail("duplicatePlayer");
  }
  if (a.format === "teams" && names.length % 2 === 1) return fail("oddTeams");

  const courtsMax = maxCourts(names.length, a.format);
  if (!isInt(a.courts) || a.courts < 1 || a.courts > courtsMax) return fail("badCourts");
  if (a.format !== "teams" && (!isInt(a.rounds) || a.rounds < 1 || a.rounds > LIMITS.maxRounds)) {
    return fail("badRounds");
  }

  // Known names map to the same person, so the ranking follows them.
  const players: Player[] = club.players.slice();
  const ids = names.map((name) => {
    const known = players.find((p) => sameName(p.name, name));
    if (known) return known.id;
    const p: Player = { id: env.newId(), name, createdAt: env.now() };
    players.push(p);
    return p.id;
  });

  const t: Tournament = {
    id: env.newId(),
    name: cleanName(a.name) || defaultName(a.format, env.now()),
    format: a.format,
    scoring,
    courts: a.courts,
    playerIds: ids,
    plannedRounds: a.rounds,
    rounds: [],
    status: "active",
    createdAt: env.now(),
  };

  if (a.format === "teams") {
    const teams: Pair[] = [];
    for (let i = 0; i < ids.length; i += 2) teams.push([ids[i], ids[i + 1]]);
    t.teams = teams;
    t.rounds = teamsSchedule(teams, a.courts, env.rng, env.newId);
    t.plannedRounds = t.rounds.length;
  } else if (a.format === "americano") {
    t.rounds = americanoSchedule(ids, a.courts, a.rounds, env.rng, env.newId);
  } else {
    t.rounds = [mexicanoRound(shuffle(ids, env.rng), a.courts, [], env.rng, env.newId)];
  }

  return { ok: true, club: { ...club, players, tournaments: [t, ...club.tournaments] }, id: t.id };
}

function defaultName(format: Format, iso: string): string {
  const label = format === "americano" ? "Americano" : format === "mexicano" ? "Mexicano" : "Equipas";
  // "Americano 29/09" — day/month reads the same in both languages here.
  return label + " " + iso.slice(8, 10) + "/" + iso.slice(5, 7);
}

function setScore(club: Club, a: Extract<Action, { type: "setScore" }>): Result {
  const t = club.tournaments.find((x) => x.id === a.tournamentId);
  if (!t) return fail("notFound");
  const clearing = a.scoreA === null && a.scoreB === null;
  if (!clearing) {
    if (!isInt(a.scoreA) || !isInt(a.scoreB) || a.scoreA < 0 || a.scoreB < 0) return fail("badScore");
    if (t.scoring.kind === "points" && a.scoreA + a.scoreB !== t.scoring.total) return fail("badScore");
    if (t.scoring.kind === "games" && (a.scoreA > LIMITS.maxGames || a.scoreB > LIMITS.maxGames)) {
      return fail("badScore");
    }
  }
  let found = false;
  const rounds = t.rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => {
      if (m.id !== a.matchId) return m;
      found = true;
      return { ...m, scoreA: clearing ? null : a.scoreA, scoreB: clearing ? null : a.scoreB };
    }),
  }));
  if (!found) return fail("notFound");
  // Scores stay editable after the end: fixing a typo should fix the ranking.
  return { ok: true, club: replace(club, { ...t, rounds }) };
}

function nextRound(club: Club, id: string, env: Env): Result {
  const t = club.tournaments.find((x) => x.id === id);
  if (!t || t.format !== "mexicano") return fail("notFound");
  if (t.status === "finished") return fail("finished");
  const last = t.rounds[t.rounds.length - 1];
  if (last && !roundComplete(t, last.n)) return fail("roundIncomplete");
  if (t.rounds.length >= LIMITS.maxRounds) return fail("allRoundsPlayed");
  const ranked = standings(t).lines.map((l) => l.ids[0]);
  const round = mexicanoRound(ranked, t.courts, t.rounds, env.rng, env.newId);
  return {
    ok: true,
    club: replace(club, { ...t, rounds: [...t.rounds, round], plannedRounds: Math.max(t.plannedRounds, t.rounds.length + 1) }),
  };
}
