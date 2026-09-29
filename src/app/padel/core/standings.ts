import type { Club, Match, Pair, Tournament } from "./types.ts";

/* Standings for one tournament, and the club ranking built from all of them.

   Individual formats (Americano, Mexicano) rank by points won — each player
   collects what their side scored — then wins, then difference. When the
   field doesn't divide evenly some players get one match fewer; in that case
   the table ranks by points per match instead, and says so, because a total
   would reward whoever happened to sit out least.

   Fixed teams rank by wins, then difference, then points won.

   The club ranking gives each finished tournament's field points by finishing
   place: with N players, 1st earns N, 2nd N-1 … last 1. Bigger tournaments
   are worth more, and turning up always earns something. In a fixed-teams
   tournament both partners take their team's place (team 1 = places 1–2). */

export interface Line {
  /** Player id, or "id|id" for a fixed team. */
  key: string;
  ids: string[];
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface Standings {
  lines: Line[];
  /** True when players have played different numbers of matches and the
      table is ranked by average instead of total. */
  byAverage: boolean;
}

export const isScored = (m: Match) => m.scoreA !== null && m.scoreB !== null;

const teamKey = (p: Pair) => p[0] + "|" + p[1];

function emptyLine(key: string, ids: string[]): Line {
  return { key, ids, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
}

function record(line: Line, forPts: number, againstPts: number) {
  line.played++;
  line.pointsFor += forPts;
  line.pointsAgainst += againstPts;
  if (forPts > againstPts) line.won++;
  else if (forPts < againstPts) line.lost++;
  else line.drawn++;
}

export const diff = (l: Line) => l.pointsFor - l.pointsAgainst;
export const average = (l: Line) => (l.played ? l.pointsFor / l.played : 0);

export function standings(t: Tournament, nameOf: (id: string) => string = (id) => id): Standings {
  const lines = new Map<string, Line>();

  if (t.format === "teams") {
    for (const team of t.teams ?? []) lines.set(teamKey(team), emptyLine(teamKey(team), [...team]));
  } else {
    for (const id of t.playerIds) lines.set(id, emptyLine(id, [id]));
  }

  for (const r of t.rounds) {
    for (const m of r.matches) {
      if (!isScored(m)) continue;
      const a = m.scoreA as number;
      const b = m.scoreB as number;
      if (t.format === "teams") {
        const la = lines.get(teamKey(m.a));
        const lb = lines.get(teamKey(m.b));
        if (la) record(la, a, b);
        if (lb) record(lb, b, a);
      } else {
        for (const id of m.a) {
          const l = lines.get(id);
          if (l) record(l, a, b);
        }
        for (const id of m.b) {
          const l = lines.get(id);
          if (l) record(l, b, a);
        }
      }
    }
  }

  const all = [...lines.values()];
  const byAverage = t.format !== "teams" && new Set(all.map((l) => l.played)).size > 1;
  const name = (l: Line) => l.ids.map(nameOf).join(" / ");

  all.sort((x, y) => {
    if (t.format === "teams") {
      return y.won - x.won || diff(y) - diff(x) || y.pointsFor - x.pointsFor || name(x).localeCompare(name(y));
    }
    const px = byAverage ? average(x) : x.pointsFor;
    const py = byAverage ? average(y) : y.pointsFor;
    return py - px || y.won - x.won || diff(y) - diff(x) || name(x).localeCompare(name(y));
  });

  return { lines: all, byAverage };
}

/** Rounds whose every match has a score. */
export function roundComplete(t: Tournament, n: number): boolean {
  const r = t.rounds.find((x) => x.n === n);
  return !!r && r.matches.every(isScored);
}

export function progress(t: Tournament): { scored: number; total: number } {
  let scored = 0;
  let total = 0;
  for (const r of t.rounds) {
    for (const m of r.matches) {
      total++;
      if (isScored(m)) scored++;
    }
  }
  return { scored, total };
}

/* ── club ranking ──────────────────────────────────────────── */

export interface RankingLine {
  playerId: string;
  points: number;
  tournaments: number;
  titles: number;
  podiums: number;
  won: number;
  lost: number;
  drawn: number;
  /** Place in each finished tournament played, newest first. */
  form: number[];
}

/** Finishing place for every player in a tournament (1 = winner). */
export function placings(t: Tournament): Map<string, number> {
  const out = new Map<string, number>();
  const { lines } = standings(t);
  lines.forEach((line, i) => {
    // A fixed team finishing 1st holds places 1 and 2 between its players.
    const place = t.format === "teams" ? i * 2 + 1 : i + 1;
    for (const id of line.ids) out.set(id, place);
  });
  return out;
}

export function clubRanking(club: Club): RankingLine[] {
  const lines = new Map<string, RankingLine>();
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) {
      l = { playerId: id, points: 0, tournaments: 0, titles: 0, podiums: 0, won: 0, lost: 0, drawn: 0, form: [] };
      lines.set(id, l);
    }
    return l;
  };

  const finished = club.tournaments
    .filter((t) => t.status === "finished")
    .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));

  for (const t of finished) {
    const field = t.playerIds.length;
    const places = placings(t);
    for (const [id, place] of places) {
      const l = line(id);
      l.tournaments++;
      l.points += Math.max(1, field - place + 1);
      if (place === 1) l.titles++;
      if (place <= (t.format === "teams" ? 5 : 3)) l.podiums++;
      l.form.push(t.format === "teams" ? Math.ceil(place / 2) : place);
    }
    for (const r of t.rounds) {
      for (const m of r.matches) {
        if (!isScored(m)) continue;
        const a = m.scoreA as number;
        const b = m.scoreB as number;
        for (const id of m.a) {
          const l = line(id);
          if (a > b) l.won++;
          else if (a < b) l.lost++;
          else l.drawn++;
        }
        for (const id of m.b) {
          const l = line(id);
          if (b > a) l.won++;
          else if (b < a) l.lost++;
          else l.drawn++;
        }
      }
    }
  }

  return [...lines.values()].sort(
    (x, y) => y.points - x.points || y.titles - x.titles || winRate(y) - winRate(x) || y.tournaments - x.tournaments,
  );
}

export function winRate(l: { won: number; lost: number; drawn: number }): number {
  const n = l.won + l.lost + l.drawn;
  return n ? l.won / n : 0;
}
