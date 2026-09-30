import type { Match, Pair, Round, Tournament } from "./types.ts";
import { groupTable, isScored, winnerOf } from "./standings.ts";
import { groupStageRounds, shuffle, type Rng } from "./schedule.ts";

/* Groups + knockout.

   Fixed pairs are drawn into groups, every pair plays every other pair in its
   group, and the best of each group go through to a knockout: quarter-finals,
   semi-finals, final. Twelve pairs, say, make two groups of six, the top two
   of each play the semi-finals, and the winners play the final.

   The knockout is never drawn by hand. As soon as the last group score is in,
   the first knockout round appears, and each round after it appears when the
   one before is complete. Until a knockout match has a score, the bracket
   keeps following the table: correcting a group score that changes who went
   through redraws it. Once a knockout match is scored that round stays as it
   is — a result is never thrown away. */

export interface GroupShape {
  groups: number;
  /** Pairs going through from each group. */
  qualifiers: number;
}

/** The shapes on offer, most useful first. groups × qualifiers is always a
    power of two, so the knockout needs no byes. */
const SHAPES: GroupShape[] = [
  { groups: 2, qualifiers: 2 },
  { groups: 4, qualifiers: 2 },
  { groups: 4, qualifiers: 1 },
  { groups: 2, qualifiers: 1 },
  { groups: 1, qualifiers: 4 },
  { groups: 1, qualifiers: 2 },
];

/** A shape works when every group has at least one pair more than go through
    from it — otherwise nobody could go out in the groups. */
export function validShape(pairs: number, s: GroupShape): boolean {
  return SHAPES.some((x) => x.groups === s.groups && x.qualifiers === s.qualifiers) && Math.floor(pairs / s.groups) >= s.qualifiers + 1;
}

export function groupShapes(pairs: number): GroupShape[] {
  return SHAPES.filter((s) => validShape(pairs, s));
}

/** The shape to start from: the first with groups of three or more, which is
    two groups and a semi-final whenever there are six pairs or more. */
export function defaultShape(pairs: number): GroupShape | null {
  const shapes = groupShapes(pairs);
  return shapes.find((s) => Math.floor(pairs / s.groups) >= 3) ?? shapes[0] ?? null;
}

/** How many pairs go into each group: as even as the numbers allow, bigger first. */
export function groupSizes(pairs: number, groups: number): number[] {
  return Array.from({ length: groups }, (_, g) => Math.floor(pairs / groups) + (g < pairs % groups ? 1 : 0));
}

/** Knockout rounds after the groups: 1 for a final only, 2 with semi-finals… */
export function knockoutRounds(s: GroupShape): number {
  return Math.round(Math.log2(s.groups * s.qualifiers));
}

export function plannedGroupRounds(pairs: number, s: GroupShape, courts: number): number {
  return groupStageRounds(groupSizes(pairs, s.groups), courts) + knockoutRounds(s);
}

/** Draws the pairs into groups at random, dealt so group sizes differ by one at most. */
export function drawGroups(teams: readonly Pair[], groups: number, rng: Rng): Pair[][] {
  const out: Pair[][] = Array.from({ length: groups }, () => []);
  shuffle(teams, rng).forEach((p, i) => out[i % groups].push(p));
  return out;
}

export const groupLetter = (g: number) => String.fromCharCode(65 + g);

/** Who meets whom in the first knockout round, by seed. Seeds are every group
    winner (A, B, …), then every runner-up, and so on. The order keeps two pairs
    from the same group apart until the final. */
const BRACKET: Record<number, [number, number][]> = {
  2: [[1, 2]],
  4: [
    [1, 4],
    [2, 3],
  ],
  8: [
    [1, 8],
    [3, 6],
    [2, 7],
    [4, 5],
  ],
};

/** The first knockout round's pairs, in match order (a, b, a, b…), or null
    while the group stage still has matches to play. */
function qualified(t: Tournament): Pair[] | null {
  const groups = t.groups ?? [];
  const q = t.qualifiers ?? 0;
  if (!t.rounds.filter((r) => !r.ko).every((r) => r.matches.every(isScored))) return null;
  const tables = groups.map((_, g) => groupTable(t, g));
  const seeds: Pair[] = [];
  for (let p = 0; p < q; p++) for (const table of tables) if (table[p]) seeds.push(table[p].ids as Pair);
  const bracket = BRACKET[seeds.length];
  if (!bracket) return null;
  return bracket.flatMap(([x, y]) => [seeds[x - 1], seeds[y - 1]]);
}

function knockoutRound(entrants: Pair[], ko: number, existing: Round | undefined, courts: number, newId: () => string): Round {
  const matches: Match[] = [];
  for (let k = 0; k * 2 < entrants.length; k++) {
    matches.push({
      // Kept when the round is redrawn, so a score sheet left open still saves.
      id: existing?.matches[k]?.id ?? newId(),
      court: (k % Math.max(1, courts)) + 1,
      a: entrants[k * 2],
      b: entrants[k * 2 + 1],
      scoreA: null,
      scoreB: null,
    });
  }
  return { n: 0, matches, byes: [], ko };
}

/** Brings the knockout in line with the results: draws the rounds that can now
    be drawn, redraws those not started whose pairs have changed, and drops
    those not started that can no longer be drawn (a group score was cleared). */
export function refreshBracket(t: Tournament, newId: () => string): Tournament {
  if (t.format !== "groups") return t;
  const rounds = t.rounds.filter((r) => !r.ko);
  let entrants = qualified(t);
  for (let ko = (t.groups?.length ?? 0) * (t.qualifiers ?? 0); ko >= 2; ko /= 2) {
    const existing = t.rounds.find((r) => r.ko === ko);
    let round: Round | null = null;
    if (existing && existing.matches.some(isScored)) round = existing;
    else if (entrants) round = knockoutRound(entrants, ko, existing, t.courts, newId);
    if (!round) {
      entrants = null;
      continue;
    }
    rounds.push({ ...round, n: rounds.length + 1 });
    const winners = round.matches.map((m) => {
      const w = winnerOf(m);
      return w ? (w === "a" ? m.a : m.b) : null;
    });
    entrants = winners.every(Boolean) ? (winners as Pair[]) : null;
  }
  return { ...t, rounds };
}

/** The first knockout round not drawn yet (8, 4 or 2 pairs left), or null
    once the final is drawn. Used to say what comes next. */
export function nextKnockout(t: Tournament): number | null {
  if (t.format !== "groups") return null;
  const first = (t.groups?.length ?? 0) * (t.qualifiers ?? 0);
  for (let ko = first; ko >= 2; ko /= 2) if (!t.rounds.some((r) => r.ko === ko)) return ko;
  return null;
}
