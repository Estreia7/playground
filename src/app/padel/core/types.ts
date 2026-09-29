/* The whole padel club lives in one small document: the people who have ever
   played, and every tournament they played in. Standings and the all-time
   ranking are never stored — they are worked out from match scores every time,
   so correcting a score from three tournaments ago fixes the ranking too. */

export type Format = "americano" | "mexicano" | "teams";

export type Scoring =
  /** Every match is played to a fixed number of points, split between the
      two sides (the usual Americano rule: 24 points, first serve rotates). */
  | { kind: "points"; total: number }
  /** Free score — games, sets, whatever the group agreed on. */
  | { kind: "games" };

export interface Player {
  id: string;
  name: string;
  createdAt: string;
}

export type Pair = [string, string];

export interface Match {
  id: string;
  court: number;
  a: Pair;
  b: Pair;
  scoreA: number | null;
  scoreB: number | null;
}

export interface Round {
  n: number;
  matches: Match[];
  /** Player ids sitting this round out. */
  byes: string[];
}

export interface Tournament {
  id: string;
  name: string;
  format: Format;
  scoring: Scoring;
  courts: number;
  playerIds: string[];
  /** Fixed pairs, only for the "teams" format. */
  teams?: Pair[];
  /** How many rounds the organiser asked for. Americano and teams schedules
      are drawn up front; Mexicano draws one round at a time up to this. */
  plannedRounds: number;
  rounds: Round[];
  status: "active" | "finished";
  createdAt: string;
  finishedAt?: string;
}

export interface Club {
  version: 1;
  players: Player[];
  tournaments: Tournament[];
}

export const EMPTY_CLUB: Club = { version: 1, players: [], tournaments: [] };

export const LIMITS = {
  minPlayers: 4,
  maxPlayers: 40,
  maxRounds: 40,
  minPointsTotal: 4,
  maxPointsTotal: 64,
  maxGames: 99,
  maxNameLength: 40,
} as const;
