import type { Match, Tournament } from "../core/types.ts";

/* How a tournament's fixtures are cut into images.

   The image is a fixed 1080px wide, which WhatsApp shows at roughly a third of
   that on a phone. Everything is sized for that: 38px names come out at about
   13px on screen, the smallest a person can read at arm's length at the court.

   Height is the interesting part. One tall image is hard to read and gets its
   preview cropped in a chat, so a big tournament is split into several, and the
   split follows a few rules:

   - A round is never cut in half if it fits on a page. "Round 3" and its two
     matches belong together, and a reader glancing at one image should see
     whole rounds.
   - Only a round taller than a whole image is split, and the continuation is
     marked, so nobody assumes the missing matches were forgotten.
   - Pages are balanced. Seven rounds become four and three, not five and two:
     the pages are sent one after the other, and a set of similar images reads
     as one thing.

   Every height here is a constant rather than a measurement. That is what makes
   this testable without a renderer, and it works because every line of text in
   the image is a single line: names are cut with an ellipsis instead of
   wrapping, so a row is always the height this file says it is. */

export const IMAGE_WIDTH = 1080;
export const PAD = 56;

export const SIZE = {
  /** Logo, title and the one-line summary, on the first image only. */
  header: 292,
  /** A slim reminder of which tournament this is, on the later images. */
  slimHeader: 132,
  footer: 104,
  /** The round title, with anyone resting that round on the same line. */
  roundHeading: 76,
  match: 116,
  matchGap: 14,
  roundGap: 26,
} as const;

/** The tallest an image is allowed to be. */
/** Tall enough that a full evening fits in two or three images, short enough
    that a chat still shows each one whole when it is opened. */
export const MAX_HEIGHT = 2000;

export interface RoundBlock {
  roundN: number;
  /** Knockout rounds: pairs left (4 = semi-finals), so the heading can say so. */
  ko?: number;
  matches: Match[];
  /** Players sitting this round out. Only listed at the start of a round. */
  byes: string[];
  /** True when this block carries on a round that began on the previous image. */
  continued: boolean;
}

export interface SharePage {
  /** 1-based. */
  number: number;
  total: number;
  first: boolean;
  blocks: RoundBlock[];
  /** Exact pixel height of the finished image. */
  height: number;
  /** The rounds this image covers, for its label: "Rounds 1–4". */
  fromRound: number;
  toRound: number;
}

/** Height of a block: its heading and its rows. */
export function blockHeight(block: RoundBlock): number {
  return SIZE.roundHeading + block.matches.length * (SIZE.match + SIZE.matchGap) + SIZE.roundGap;
}

function chrome(first: boolean): number {
  return (first ? SIZE.header : SIZE.slimHeader) + SIZE.footer;
}

/** Cut the rounds into pages of at most `cap` pixels, without balancing. */
function pack(t: Tournament, cap: number): RoundBlock[][] {
  const pages: RoundBlock[][] = [];
  let current: RoundBlock[] = [];
  let used = chrome(true);

  const flush = () => {
    pages.push(current);
    current = [];
    used = chrome(false);
  };

  for (const round of t.rounds) {
    let pending: RoundBlock = {
      roundN: round.n,
      ko: round.ko,
      matches: [...round.matches].sort((a, b) => a.court - b.court),
      byes: round.byes,
      continued: false,
    };

    // A block goes on whole when it fits. When it does not, and the page
    // already has something on it, start a fresh page: a round belongs together
    // if it can be.
    for (;;) {
      const height = blockHeight(pending);
      if (used + height <= cap) {
        current.push(pending);
        used += height;
        break;
      }

      const fresh = current.length === 0;
      const room = cap - used;
      const fixed = SIZE.roundHeading + SIZE.roundGap;
      const rows = Math.floor((room - fixed) / (SIZE.match + SIZE.matchGap));

      if (!fresh && height <= cap - chrome(false)) {
        // It would fit on an empty page, so move it there whole.
        flush();
        continue;
      }
      if (rows >= 1 && rows < pending.matches.length) {
        // Too tall for any single page: take what fits, carry the rest over.
        current.push({ ...pending, matches: pending.matches.slice(0, rows) });
        pending = { ...pending, matches: pending.matches.slice(rows), continued: true };
        flush();
        continue;
      }
      if (fresh) {
        // Not even one row fits on an empty page. That cannot happen with the
        // sizes above, but a loop here would hang the request, so place it.
        current.push(pending);
        used += height;
        break;
      }
      flush();
    }
  }

  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

/** Split a tournament into the images that show its fixtures. */
export function paginate(t: Tournament): SharePage[] {
  const greedy = pack(t, MAX_HEIGHT);
  const count = greedy.length;

  // Balance: find the lowest height cap that still needs no more images than
  // the greedy pass. The page count never goes up; the pages just even out.
  let lo = chrome(false) + SIZE.roundHeading + SIZE.match + SIZE.roundGap;
  let hi = MAX_HEIGHT;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pack(t, mid).length <= count) hi = mid;
    else lo = mid + 1;
  }
  const balanced = pack(t, hi);
  const pages = balanced.length <= count ? balanced : greedy;

  return pages.map((blocks, i) => {
    const first = i === 0;
    const rounds = blocks.map((b) => b.roundN);
    return {
      number: i + 1,
      total: pages.length,
      first,
      blocks,
      height: chrome(first) + blocks.reduce((sum, b) => sum + blockHeight(b), 0),
      fromRound: rounds.length ? Math.min(...rounds) : 0,
      toRound: rounds.length ? Math.max(...rounds) : 0,
    };
  });
}

/** A stable token that changes whenever the fixtures or their scores do, so a
    cached image is never shown for a tournament that has moved on. */
export function revision(t: Tournament): string {
  let scored = 0;
  let matches = 0;
  for (const r of t.rounds) {
    for (const m of r.matches) {
      matches++;
      if (m.scoreA !== null && m.scoreB !== null) scored++;
    }
  }
  return `${t.rounds.length}-${matches}-${scored}`;
}
