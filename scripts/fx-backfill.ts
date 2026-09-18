/* Backfill EUR/USD history from Dukascopy into storage/fx.

   Run from the repo root:

     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/fx-backfill.ts
     node ... scripts/fx-backfill.ts --tf 1h,15m --years 3

   This is the same code path the Data tab's Backfill button uses. It exists as
   a CLI because the first backfill of several years takes minutes and is much
   better watched in a terminal on the VPS than through a browser tab.

   Rerunning is safe: bars merge by timestamp, so an interrupted run resumes
   simply by being started again, and the Dukascopy cache means the second
   attempt skips everything already downloaded. */

import { backfill } from "../src/app/api/fx/providers/dukascopy.ts";
import { writeCandles, timeframeStatus } from "../src/app/api/fx/storage.ts";
import { TIMEFRAMES, timeframe, isTimeframeId, type TimeframeId } from "../src/app/fx/timeframes.ts";
import { DEFAULT_PAIR } from "../src/app/fx/pairs.ts";

function arg(name: string): string | null {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

async function main(): Promise<void> {
  const tfArg = arg("tf");
  const yearsArg = arg("years");

  const requested: TimeframeId[] = tfArg
    ? tfArg
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is TimeframeId => {
          if (isTimeframeId(s)) return true;
          console.error("Unknown timeframe: " + s);
          return false;
        })
    : TIMEFRAMES.map((t) => t.id);

  if (requested.length === 0) {
    console.error("Nothing to do.");
    process.exit(1);
  }

  const pairId = DEFAULT_PAIR;
  console.log("Backfilling " + pairId + ": " + requested.join(", "));

  for (const tf of requested) {
    const meta = timeframe(tf);
    const years = yearsArg ? Number(yearsArg) : meta.backfillYears;
    const to = new Date();
    const from = new Date(to.getTime() - years * 365.25 * 24 * 60 * 60 * 1000);

    console.log(
      "\n" + meta.label + " — " + years + "y from " + from.toISOString().slice(0, 10),
    );

    let lastLogged = -1;
    const candles = await backfill(pairId, tf, {
      from,
      to,
      onProgress: (p) => {
        if (p.total === 0) return;
        const pct = Math.floor((p.done / p.total) * 100);
        // Log every 10% so a five-year 1m backfill does not print 300 lines.
        if (pct >= lastLogged + 10) {
          lastLogged = pct;
          process.stdout.write("  " + pct + "% (" + p.bars + " bars)\n");
        }
      },
    });

    await writeCandles(pairId, tf, candles);
    const status = await timeframeStatus(pairId, tf);
    console.log(
      "  stored " +
        status.bars +
        " bars, last " +
        (status.lastBar ? new Date(status.lastBar * 1000).toISOString() : "none"),
    );
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
