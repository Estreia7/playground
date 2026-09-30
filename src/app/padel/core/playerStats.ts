import type { Club, Match, Tournament } from "./types.ts";
import { isScored, placings, winRate } from "./standings.ts";

/* Everything one player's record can tell you, worked out from match scores.

   Like the standings and the ranking, nothing here is stored. The club
   document holds players and tournaments; every number below is derived, so
   correcting a score from three tournaments ago corrects the statistics too.

   Only FINISHED tournaments count, which is the same rule the club ranking
   uses. A tournament still in progress would let a good first round inflate
   someone's win rate until the bad rounds arrive, and having the two pages
   disagree about the same player would be worse than having both wait.

   The partner and opponent tables are the point of this module. A padel
   player's results are not really their own: who you were drawn with decides a
   lot of them, and "who do I win with" is the question people actually argue
   about after a tournament. In the fixed-teams format there is only ever one
   partner, so the partner table is the same fact repeated — the caller can
   tell from `format` counts whether it is worth showing. */

export interface Tally {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** A partner or an opponent, with the record alongside them. */
export interface PairTally extends Tally {
  playerId: string;
}

export interface TournamentLine {
  tournamentId: string;
  name: string;
  format: Tournament["format"];
  /** Finishing place, 1 = winner. */
  place: number;
  /** How many players were in the field, for "3rd of 12". */
  field: number;
  finishedAt: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayerStats {
  playerId: string;
  /** Matches, wins, points — the headline record. */
  total: Tally;
  tournaments: number;
  titles: number;
  podiums: number;
  /** Best and worst finishing place, and how often the best one happened. */
  bestPlace: number | null;
  worstPlace: number | null;
  /** Average finishing place across finished tournaments. */
  averagePlace: number | null;
  /** Points scored per match played, and conceded. Comparable between players
      who have played different numbers of matches. */
  pointsForPerMatch: number;
  pointsAgainstPerMatch: number;
  /** Longest runs of wins and losses, in match order across all tournaments. */
  longestWinStreak: number;
  longestLossStreak: number;
  /** Current run: positive for wins, negative for losses, 0 for a draw or no
      matches at all. */
  currentStreak: number;
  /** Every partner and opponent faced, most matches first. */
  partners: PairTally[];
  opponents: PairTally[];
  /** One line per finished tournament, newest first. */
  history: TournamentLine[];
  /** Results of the last matches played, newest first. */
  recentForm: ("W" | "D" | "L")[];
}

function emptyTally(): Tally {
  return { played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
}

function record(tally: Tally, forPts: number, againstPts: number): void {
  tally.played++;
  tally.pointsFor += forPts;
  tally.pointsAgainst += againstPts;
  if (forPts > againstPts) tally.won++;
  else if (forPts < againstPts) tally.lost++;
  else tally.drawn++;
}

export const tallyDiff = (t: Tally) => t.pointsFor - t.pointsAgainst;
export const tallyWinRate = (t: Tally) => winRate(t);

/** Finished tournaments, newest first — the same set and order the club
    ranking walks, so the two pages always agree about what counts. */
function finishedTournaments(club: Club): Tournament[] {
  return club.tournaments
    .filter((t) => t.status === "finished")
    .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
}

/** Which side of a match a player was on, or null if they did not play it. */
function sideOf(match: Match, playerId: string): "a" | "b" | null {
  if (match.a.includes(playerId)) return "a";
  if (match.b.includes(playerId)) return "b";
  return null;
}

export function playerStats(club: Club, playerId: string): PlayerStats {
  const total = emptyTally();
  const partners = new Map<string, PairTally>();
  const opponents = new Map<string, PairTally>();
  const history: TournamentLine[] = [];
  const places: number[] = [];

  // Match results in the order they were played, oldest first, so the streak
  // arithmetic reads forwards and `recentForm` can simply be reversed.
  const sequence: ("W" | "D" | "L")[] = [];

  const pairLine = (map: Map<string, PairTally>, id: string): PairTally => {
    let line = map.get(id);
    if (!line) {
      line = { playerId: id, ...emptyTally() };
      map.set(id, line);
    }
    return line;
  };

  // Walk oldest first for the streaks, then present the history newest first.
  const finished = finishedTournaments(club).slice().reverse();

  for (const tournament of finished) {
    if (!tournament.playerIds.includes(playerId)) continue;

    const perTournament = emptyTally();

    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        if (!isScored(match)) continue;
        const side = sideOf(match, playerId);
        if (side === null) continue;

        const scoreA = match.scoreA as number;
        const scoreB = match.scoreB as number;
        const forPts = side === "a" ? scoreA : scoreB;
        const againstPts = side === "a" ? scoreB : scoreA;

        record(total, forPts, againstPts);
        record(perTournament, forPts, againstPts);
        sequence.push(forPts > againstPts ? "W" : forPts < againstPts ? "L" : "D");

        const own = side === "a" ? match.a : match.b;
        const other = side === "a" ? match.b : match.a;

        for (const id of own) {
          if (id === playerId) continue;
          record(pairLine(partners, id), forPts, againstPts);
        }
        for (const id of other) {
          record(pairLine(opponents, id), forPts, againstPts);
        }
      }
    }

    const place = placings(tournament).get(playerId);
    if (place !== undefined) {
      places.push(place);
      history.push({
        tournamentId: tournament.id,
        name: tournament.name,
        format: tournament.format,
        place,
        field: tournament.playerIds.length,
        finishedAt: tournament.finishedAt ?? tournament.createdAt,
        played: perTournament.played,
        won: perTournament.won,
        drawn: perTournament.drawn,
        lost: perTournament.lost,
        pointsFor: perTournament.pointsFor,
        pointsAgainst: perTournament.pointsAgainst,
      });
    }
  }

  const streaks = streakRuns(sequence);

  /* Best record first, with more matches breaking a tie.

     Sorting by matches played instead buries the interesting rows: a perfect
     record over five matches would sit below a mediocre one over six. The
     match count is right there in its own column for anyone weighing how much
     a row is worth. */
  const byRecord = (x: PairTally, y: PairTally) =>
    tallyWinRate(y) - tallyWinRate(x) || y.played - x.played;

  return {
    playerId,
    total,
    tournaments: history.length,
    titles: places.filter((p) => p === 1).length,
    // A fixed-teams tournament puts two players on each step of the podium,
    // which is the same rule the club ranking applies.
    podiums: history.filter((h) => h.place <= (h.format === "teams" ? 5 : 3)).length,
    bestPlace: places.length ? Math.min(...places) : null,
    worstPlace: places.length ? Math.max(...places) : null,
    averagePlace: places.length ? places.reduce((s, p) => s + p, 0) / places.length : null,
    pointsForPerMatch: total.played ? total.pointsFor / total.played : 0,
    pointsAgainstPerMatch: total.played ? total.pointsAgainst / total.played : 0,
    longestWinStreak: streaks.longestWin,
    longestLossStreak: streaks.longestLoss,
    currentStreak: streaks.current,
    partners: [...partners.values()].sort(byRecord),
    opponents: [...opponents.values()].sort(byRecord),
    history: history.reverse(),
    recentForm: sequence.slice(-10).reverse(),
  };
}

/* Longest runs, and the run still going.

   A draw breaks both streaks without starting either, which is what "three
   wins in a row" means in conversation. `current` is signed: +3 for three
   wins, -2 for two losses, 0 when the last match was drawn or none was
   played. */
function streakRuns(sequence: ("W" | "D" | "L")[]): {
  longestWin: number;
  longestLoss: number;
  current: number;
} {
  let longestWin = 0;
  let longestLoss = 0;
  let runWin = 0;
  let runLoss = 0;

  for (const result of sequence) {
    if (result === "W") {
      runWin++;
      runLoss = 0;
    } else if (result === "L") {
      runLoss++;
      runWin = 0;
    } else {
      runWin = 0;
      runLoss = 0;
    }
    if (runWin > longestWin) longestWin = runWin;
    if (runLoss > longestLoss) longestLoss = runLoss;
  }

  // Guard the sign explicitly: negating a zero run gives -0, which compares
  // unequal to 0 and formats as "-0" on screen.
  const current = runWin > 0 ? runWin : runLoss > 0 ? -runLoss : 0;
  return { longestWin, longestLoss, current };
}

/* ── highlights ────────────────────────────────────────────────

   The partner and opponent tables answer "who have I played with", but the
   question people actually ask is "who do I win with". These pick the
   standouts.

   A minimum number of shared matches applies to every pick. Without it the
   answer is always whoever you played once and beat, which is true and
   useless. Three is low enough that a small club still gets an answer and high
   enough that the answer is not pure noise. */

export const MIN_SHARED_MATCHES = 3;

export interface Highlight {
  playerId: string;
  played: number;
  won: number;
  rate: number;
}

function pick(
  lines: PairTally[],
  minimum: number,
  best: boolean,
): Highlight | null {
  const eligible = lines.filter((l) => l.played >= minimum);
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((x, y) => {
    const rx = tallyWinRate(x);
    const ry = tallyWinRate(y);
    // Ties on rate go to the pairing with more matches behind it.
    return best ? ry - rx || y.played - x.played : rx - ry || y.played - x.played;
  });

  const chosen = sorted[0];
  return {
    playerId: chosen.playerId,
    played: chosen.played,
    won: chosen.won,
    rate: tallyWinRate(chosen),
  };
}

export interface Highlights {
  /** The partner this player wins most with, and least with. */
  bestPartner: Highlight | null;
  worstPartner: Highlight | null;
  /** The opponent they beat most often, and the one who beats them. */
  favouriteOpponent: Highlight | null;
  nemesis: Highlight | null;
  /** How many shared matches a pairing needed to qualify. */
  minimum: number;
}

export function highlights(stats: PlayerStats, minimum = MIN_SHARED_MATCHES): Highlights {
  /* In a small club nobody may reach the threshold. Rather than show nothing,
     drop to two shared matches, then one, so the panel says something true —
     the UI prints the sample size beside every claim.

     The threshold is chosen ONCE per table and used for both ends of it. Doing
     it per pick would let best and worst be drawn from different pools,
     which can name a partner as the best while a better one sits just under a
     stricter cut. */
  const floorFor = (lines: PairTally[]): number => {
    for (const floor of [minimum, 2, 1]) {
      if (lines.some((l) => l.played >= floor)) return floor;
    }
    return 1;
  };

  const partnerFloor = floorFor(stats.partners);
  const opponentFloor = floorFor(stats.opponents);

  const bestPartner = pick(stats.partners, partnerFloor, true);
  const worstPartner = pick(stats.partners, partnerFloor, false);
  const favouriteOpponent = pick(stats.opponents, opponentFloor, true);
  const nemesis = pick(stats.opponents, opponentFloor, false);

  /* "Best" and "worst" only mean something when they differ.

     With one partner on record, or when every qualifying pairing shares the
     same win rate, both ends of the table land on the same person. Labelling
     them as both would be a lie in one of the two places. In that case keep
     only the losing reading: "you lose with this partner" is advice, while
     "they are also your best" is an artefact of having nothing to compare. */
  const settled = (
    best: Highlight | null,
    worst: Highlight | null,
  ): [Highlight | null, Highlight | null] =>
    best && worst && best.rate !== worst.rate ? [best, worst] : [null, worst ?? best];

  const [partnerBest, partnerWorst] = settled(bestPartner, worstPartner);
  const [opponentBest, opponentWorst] = settled(favouriteOpponent, nemesis);

  return {
    bestPartner: partnerBest,
    worstPartner: partnerWorst,
    favouriteOpponent: opponentBest,
    nemesis: opponentWorst,
    minimum,
  };
}

/** Every player who has appeared in a finished tournament, for the picker. */
export function playersWithStats(club: Club): string[] {
  const seen = new Set<string>();
  for (const tournament of finishedTournaments(club)) {
    for (const id of tournament.playerIds) seen.add(id);
  }
  return [...seen];
}
