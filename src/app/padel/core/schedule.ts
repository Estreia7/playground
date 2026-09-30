import { isPairFormat, type Format, type Match, type Pair, type Round } from "./types.ts";

/* Draws the matches.

   Americano — everyone partners everyone and meets everyone across the net,
   as evenly as the numbers allow. A perfect schedule only exists for a few
   player counts, so rather than chase one this builds each round by trying
   many random groupings and keeping the one that repeats the fewest partners
   (expensive) and opponents (cheaper). For club-sized fields that lands on,
   or within a repeat or two of, the ideal.

   Mexicano — round one is random, after that the table decides: 1st and 4th
   play 2nd and 3rd, 5th and 8th play 6th and 7th, and so on. Games stay tight
   all evening.

   Teams — fixed pairs, a plain round robin (circle method), split into waves
   when there are more matches in a round than courts.

   Groups — the same round robin inside each group, the groups played side by
   side. The knockout that follows is drawn in groups.ts.

   Sitting out is shared: whoever has sat out least is next to rest. */

export type Rng = () => number;

/** Small seeded PRNG (mulberry32), so tests can pin the draw. */
export function rngFromSeed(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The most courts a field can fill: four players a court. */
export function maxCourts(players: number, format: Format): number {
  return isPairFormat(format) ? Math.floor(Math.floor(players / 2) / 2) : Math.floor(players / 4);
}

/** Smallest round count that lets everyone partner everyone once (n-1) and,
    where the field doesn't divide into the courts, also gives everyone the
    same number of matches. Capped so an awkward count doesn't ask for 30. */
export function suggestedRounds(players: number, courts: number): number {
  const perRound = courts * 4;
  const base = Math.max(1, players - 1);
  for (let r = base; r <= base + players; r++) {
    if ((r * perRound) % players === 0) return Math.min(r, 20);
  }
  return Math.min(base, 20);
}

/** Round-robin length for fixed teams: every team meets every other once,
    split into waves of at most `courts` matches. */
export function teamRounds(teams: number, courts: number): number {
  if (teams < 2) return 0;
  const circleRounds = teams % 2 === 0 ? teams - 1 : teams;
  const waves = Math.ceil(Math.floor(teams / 2) / Math.max(1, courts));
  return circleRounds * waves;
}

type Counts = Map<string, number>;

const pairKey = (x: string, y: string) => (x < y ? x + "|" + y : y + "|" + x);
const bump = (m: Counts, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const get = (m: Counts, k: string) => m.get(k) ?? 0;

interface History {
  partners: Counts;
  opponents: Counts;
  byes: Counts;
}

function historyOf(rounds: readonly Round[]): History {
  const h: History = { partners: new Map(), opponents: new Map(), byes: new Map() };
  for (const r of rounds) {
    for (const id of r.byes) bump(h.byes, id);
    for (const m of r.matches) addMatch(h, m.a, m.b);
  }
  return h;
}

function addMatch(h: History, a: Pair, b: Pair) {
  bump(h.partners, pairKey(a[0], a[1]));
  bump(h.partners, pairKey(b[0], b[1]));
  for (const x of a) for (const y of b) bump(h.opponents, pairKey(x, y));
}

/** Who sits out: those who have sat out least go first; ties broken at random. */
function pickByes(ids: readonly string[], sitOut: number, byes: Counts, rng: Rng): string[] {
  if (sitOut <= 0) return [];
  return shuffle(ids, rng)
    .sort((x, y) => get(byes, x) - get(byes, y))
    .slice(0, sitOut);
}

const PARTNER_COST = 100;
const OPPONENT_COST = 10;

/** Best of the three ways four players split into two pairs. */
function bestSplit(q: readonly string[], h: History): { a: Pair; b: Pair; cost: number } {
  const options: [Pair, Pair][] = [
    [[q[0], q[1]], [q[2], q[3]]],
    [[q[0], q[2]], [q[1], q[3]]],
    [[q[0], q[3]], [q[1], q[2]]],
  ];
  let best = { a: options[0][0], b: options[0][1], cost: Infinity };
  for (const [a, b] of options) {
    let cost = PARTNER_COST * (get(h.partners, pairKey(a[0], a[1])) + get(h.partners, pairKey(b[0], b[1])));
    for (const x of a) for (const y of b) cost += OPPONENT_COST * get(h.opponents, pairKey(x, y));
    if (cost < best.cost) best = { a, b, cost };
  }
  return best;
}

/** Searches for the playing order (chunks of four) with the lowest repeat cost:
    random restarts, each polished by swapping players between courts. Only
    the two courts a swap touches are re-costed, so big fields stay fast. */
function bestGrouping(playing: readonly string[], h: History, rng: Rng): string[] {
  const restarts = playing.length <= 12 ? 20 : 8;
  const groups = playing.length / 4;
  const costOf = (order: readonly string[], g: number) => bestSplit(order.slice(g * 4, g * 4 + 4), h).cost;
  let best: string[] = playing.slice();
  let bestCost = Infinity;
  for (let r = 0; r < restarts && bestCost > 0; r++) {
    const order = shuffle(playing, rng);
    const costs = Array.from({ length: groups }, (_, g) => costOf(order, g));
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const gi = Math.floor(i / 4);
          const gj = Math.floor(j / 4);
          if (gi === gj || costs[gi] + costs[gj] === 0) continue;
          [order[i], order[j]] = [order[j], order[i]];
          const ci = costOf(order, gi);
          const cj = costOf(order, gj);
          if (ci + cj < costs[gi] + costs[gj]) {
            costs[gi] = ci;
            costs[gj] = cj;
            improved = true;
          } else {
            [order[i], order[j]] = [order[j], order[i]];
          }
        }
      }
    }
    const cost = costs.reduce((x, y) => x + y, 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = order.slice();
    }
  }
  return best;
}

function toMatches(order: readonly string[], h: History, newId: () => string): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < order.length; i += 4) {
    const { a, b } = bestSplit(order.slice(i, i + 4), h);
    addMatch(h, a, b);
    matches.push({ id: newId(), court: i / 4 + 1, a, b, scoreA: null, scoreB: null });
  }
  return matches;
}

/** One Americano round, given everything played so far. When someone has to
    sit out, several fair choices of who (all equally short on rests) are
    tried, and the one that allows the freshest pairings wins. */
export function americanoRound(
  playerIds: readonly string[],
  courts: number,
  previous: readonly Round[],
  rng: Rng,
  newId: () => string,
): Round {
  const h = historyOf(previous);
  const playingCount = Math.min(courts, maxCourts(playerIds.length, "americano")) * 4;
  const sitOut = playerIds.length - playingCount;
  let best: { byes: string[]; order: string[]; cost: number } | null = null;
  for (let attempt = 0; attempt < (sitOut > 0 ? 6 : 1); attempt++) {
    const byes = pickByes(playerIds, sitOut, h.byes, rng);
    const playing = playerIds.filter((id) => !byes.includes(id));
    const order = bestGrouping(playing, h, rng);
    let cost = 0;
    for (let i = 0; i < order.length; i += 4) cost += bestSplit(order.slice(i, i + 4), h).cost;
    if (!best || cost < best.cost) best = { byes, order, cost };
    if (cost === 0) break;
  }
  const { byes, order } = best as { byes: string[]; order: string[] };
  return { n: previous.length + 1, matches: toMatches(order, h, newId), byes };
}

/** How long the server may spend looking for a better draw. */
const SEARCH_BUDGET_MS = 700;

function scheduleCost(rounds: readonly Round[]): number {
  const h = historyOf(rounds);
  let cost = 0;
  for (const v of h.partners.values()) cost += PARTNER_COST * (v - 1);
  for (const v of h.opponents.values()) cost += OPPONENT_COST * (v - 1);
  return cost;
}

/** The full Americano schedule, drawn up front so everyone can see when they
    play. Round-by-round drawing can paint itself into a corner late on, so
    whole schedules are redrawn for as long as the time budget allows and the
    one with the fewest repeats is kept. */
export function americanoSchedule(
  playerIds: readonly string[],
  courts: number,
  rounds: number,
  rng: Rng,
  newId: () => string,
): Round[] {
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  let best: Round[] = [];
  let bestCost = Infinity;
  for (let a = 0; a < 50 && bestCost > 0 && (a === 0 || Date.now() < deadline); a++) {
    const out: Round[] = [];
    for (let i = 0; i < rounds; i++) out.push(americanoRound(playerIds, courts, out, rng, () => ""));
    const cost = scheduleCost(out);
    if (cost < bestCost) {
      bestCost = cost;
      best = out;
    }
  }
  // Ids are handed out once the winning draw is known, so they stay sequential.
  return best.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, id: newId() })) }));
}

/** One Mexicano round. `ranked` is every player, best first, by the current
    standings. Round one should be passed a shuffled list. */
export function mexicanoRound(
  ranked: readonly string[],
  courts: number,
  previous: readonly Round[],
  rng: Rng,
  newId: () => string,
): Round {
  const h = historyOf(previous);
  const playingCount = Math.min(courts, maxCourts(ranked.length, "mexicano")) * 4;
  const byes = pickByes(ranked, ranked.length - playingCount, h.byes, rng);
  const playing = ranked.filter((id) => !byes.includes(id));
  const matches: Match[] = [];
  for (let i = 0; i < playing.length; i += 4) {
    const [p1, p2, p3, p4] = playing.slice(i, i + 4);
    matches.push({ id: newId(), court: i / 4 + 1, a: [p1, p4], b: [p2, p3], scoreA: null, scoreB: null });
  }
  return { n: previous.length + 1, matches, byes };
}

/** The circle method: `count` teams, every one meeting every other once. Each
    entry is one round's games, as pairs of team indexes. */
function circleRounds(count: number, rng: Rng): [number, number][][] {
  const BYE = "__bye__";
  const idx: string[] = shuffle(Array.from({ length: count }, (_, i) => String(i)), rng);
  if (idx.length % 2 === 1) idx.push(BYE);
  const n = idx.length;
  const out: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const games: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = idx[i];
      const y = idx[n - 1 - i];
      if (x !== BYE && y !== BYE) games.push([Number(x), Number(y)]);
    }
    out.push(games);
    // rotate every slot but the first
    idx.splice(1, 0, idx.pop() as string);
  }
  return out;
}

/** Splits one circle round into waves of at most `courts` matches; everyone
    not on court in a wave sits it out. */
function toWaves(
  games: { a: Pair; b: Pair; group?: number }[],
  everyone: readonly string[],
  courts: number,
  rounds: Round[],
  newId: () => string,
) {
  const size = Math.max(1, courts);
  for (let w = 0; w < games.length; w += size) {
    const matches: Match[] = games.slice(w, w + size).map((g, i) => ({
      id: newId(),
      court: i + 1,
      a: g.a,
      b: g.b,
      scoreA: null,
      scoreB: null,
      ...(g.group !== undefined ? { group: g.group } : {}),
    }));
    const onCourt = new Set(matches.flatMap((m) => [...m.a, ...m.b]));
    rounds.push({ n: rounds.length + 1, matches, byes: everyone.filter((id) => !onCourt.has(id)) });
  }
}

/** Round robin for fixed teams (circle method). Each circle round is split into
    waves of at most `courts` matches; the teams not on court in a wave sit out. */
export function teamsSchedule(teams: readonly Pair[], courts: number, rng: Rng, newId: () => string): Round[] {
  const rounds: Round[] = [];
  const everyone = teams.flat();
  for (const games of circleRounds(teams.length, rng)) {
    toWaves(games.map(([x, y]) => ({ a: teams[x], b: teams[y] })), everyone, courts, rounds, newId);
  }
  return rounds;
}

/** Group stage: a round robin inside each group, played side by side. Round r
    of every group goes on court together, split into waves when there are more
    matches than courts, so the groups finish at about the same time. */
export function groupsSchedule(groups: readonly Pair[][], courts: number, rng: Rng, newId: () => string): Round[] {
  const circles = groups.map((g) => circleRounds(g.length, rng));
  const depth = Math.max(0, ...circles.map((c) => c.length));
  const everyone = groups.flat(2);
  const rounds: Round[] = [];
  for (let r = 0; r < depth; r++) {
    const games = circles.flatMap((c, gi) => (c[r] ?? []).map(([x, y]) => ({ a: groups[gi][x], b: groups[gi][y], group: gi })));
    toWaves(games, everyone, courts, rounds, newId);
  }
  return rounds;
}

/** How many group-stage rounds `groupsSchedule` will draw. */
export function groupStageRounds(sizes: readonly number[], courts: number): number {
  const depth = Math.max(0, ...sizes.map((s) => (s < 2 ? 0 : s % 2 === 0 ? s - 1 : s)));
  let rounds = 0;
  for (let r = 0; r < depth; r++) {
    const games = sizes.reduce((sum, s) => sum + (r < (s % 2 === 0 ? s - 1 : s) ? Math.floor(s / 2) : 0), 0);
    rounds += Math.ceil(games / Math.max(1, courts));
  }
  return rounds;
}
