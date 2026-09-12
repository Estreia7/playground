#!/usr/bin/env node
/* LFP — image generation via KIE (GPT Image 2.5).

   Run:  node scripts/gen-images.mjs [slug|all] [--force]

   The API client lives in ./kie.mjs, which is project-agnostic and meant
   to be copied between projects. This file holds only what is specific to
   LFP: the prompts and the house style.

   Images are generated ONCE and committed. The runtime never calls this
   API: a generated file on disk costs nothing per view, cannot fail on a
   slow night, and stays identical for everyone — the same reasoning as the
   economic data sync.

   What is deliberately NOT generated: anything that stands in for a
   number. The MoneyFlow diagram, the charts and the ledgers are drawn
   from the real tables, and their proportions change with the input. A
   painted "wallet with money" would be a fixed picture that contradicts
   the figure beside it the moment the reader types a different salary.
   These images sit where there is no data to represent: the branch doors
   and the quiz invitation. */

import path from "node:path";
import { generateSet } from "./kie.mjs";

const OUT_DIR = path.join(process.cwd(), "public", "lfp");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const which = args.find((a) => !a.startsWith("--")) ?? "all";

/* A shared preamble keeps the six images looking like one set rather than
   six separate commissions. */
const STYLE =
  "Flat vector editorial illustration in the style of Portuguese azulejo tile art. " +
  "Strictly limited palette: warm off-white lime-plaster background #F5F2E9, deep cobalt blue #1B4E8C line work and fills, " +
  "muted gold #8A6314 for small accents only. No other colours. No red, no green. " +
  "Clean confident linework, generous negative space, " +
  "no text, no letters, no numbers, no logos, no watermark, no people's faces. " +
  "Calm, precise, documentary feel — not playful, not cartoonish, not 3D, no gradients, no drop shadows. " +
  // The first pass came back as a decorative tile panel with the subject
  // small inside it; the ornament has to stay subordinate.
  "The subject fills most of the frame and is the clear focus. " +
  "Plain uncluttered background with at most a faint tile seam — no decorative corner flourishes, no tile borders, no framing pattern.";

const IMAGES = [
  {
    slug: "door-individual",
    ratio: "3:2",
    prompt:
      "A single payslip envelope, half-opened, seen straight on from above on a plain surface. " +
      "Beside it a few coins stacked in a neat column. Simple, quiet, domestic.",
  },
  {
    slug: "door-empresarial",
    ratio: "3:2",
    prompt:
      "A small shopfront seen straight on: awning, door, one window, in the manner of a Lisbon street business. " +
      "Simple geometric architecture, no signage, no lettering.",
  },
  {
    slug: "door-economia",
    ratio: "3:2",
    prompt:
      "An antique navigator's compass rose beside a folded paper map, seen from above. " +
      "Age-of-Discoveries cartography feel, geometric and precise.",
  },
  {
    slug: "quiz",
    ratio: "3:2",
    prompt:
      "An open notebook seen from above with a fountain pen resting on it, " +
      "and three small blank checkbox squares drawn on the page. No writing, no words.",
  },
  {
    slug: "hero-tiles",
    ratio: "16:9",
    width: 1600,
    prompt:
      "A wide decorative azulejo tile panel: repeating geometric pattern of interlocking squares and quarter-circles, " +
      "the kind found on a Lisbon building facade. Purely ornamental pattern, seamless, evenly lit, very subtle contrast.",
  },
  {
    slug: "contribuir",
    ratio: "3:2",
    prompt:
      "A hand-written letter and a simple envelope on a plain surface, seen from above, " +
      "with a magnifying glass resting beside them. The letter's lines are suggested by plain ruled strokes, not readable text.",
  },
];

const todo = which === "all" ? IMAGES : IMAGES.filter((i) => i.slug === which);
if (!todo.length) {
  console.error(`unknown slug: ${which}\navailable: ${IMAGES.map((i) => i.slug).join(", ")}`);
  process.exit(1);
}

const { failed } = await generateSet(todo, {
  outDir: OUT_DIR,
  style: STYLE,
  force: FORCE,
});

process.exit(failed ? 1 : 0);
