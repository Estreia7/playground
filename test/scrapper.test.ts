import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummary } from "../src/app/airbnb-str-scrapper/helpers.ts";
import type { JobState } from "../src/app/airbnb-str-scrapper/types.ts";

/* Inlined rather than imported: helpers.ts reaches ./types extensionless, which
   Next resolves but bare `node --test` does not. Keeping the one-line key
   builder here keeps the module graph flat for the test runner. */
function cellKey(url: string, monthIndex: number): string {
  return `${url}|${monthIndex}`;
}

/* Fixtures use round, obviously-synthetic ADRs. These tests pin the override
   and exclusion arithmetic — that a manual value replaces the scraped one
   everywhere, that clearing it restores the scraped value, and that hiding a
   cell still wins over an override. */

const URL_A = "https://www.airbnb.com/rooms/111";
const URL_B = "https://www.airbnb.com/rooms/222";

function job(over: Partial<JobState> = {}): JobState {
  return {
    id: "j1",
    status: "done",
    createdAt: 0,
    urls: [URL_A, URL_B],
    name: "fixture",
    location: "",
    excluded: new Set<string>(),
    overrides: {},
    listings: {
      [URL_A]: {
        url: URL_A,
        status: "done",
        monthsDone: 2,
        months: [
          { month: "2026-01", adr: 100, samples: 3, notes: "" },
          { month: "2026-02", adr: 200, samples: 3, notes: "" },
        ],
      },
      [URL_B]: {
        url: URL_B,
        status: "done",
        monthsDone: 2,
        months: [
          { month: "2026-01", adr: 300, samples: 3, notes: "" },
          { month: "2026-02", adr: 400, samples: 3, notes: "" },
        ],
      },
    },
    ...over,
  };
}

test("with no overrides the scraped values drive every average", () => {
  const s = buildSummary(job());
  assert.equal(s.rows[0].adrByMonth[0], 100);
  assert.equal(s.rows[0].avgAdr, 150);
  assert.equal(s.monthAverages[0], 200); // (100 + 300) / 2
  assert.equal(s.overallAvg, 250); // (150 + 350) / 2
  assert.equal(s.rows[0].overriddenByMonth[0], false);
});

test("an override replaces the scraped value in the row and month averages", () => {
  const s = buildSummary(job({ overrides: { [cellKey(URL_A, 0)]: 500 } }));
  assert.equal(s.rows[0].adrByMonth[0], 500);
  assert.equal(s.rows[0].scrapedByMonth[0], 100, "scraped value is preserved");
  assert.equal(s.rows[0].overriddenByMonth[0], true);
  assert.equal(s.rows[0].avgAdr, 350); // (500 + 200) / 2
  assert.equal(s.monthAverages[0], 400); // (500 + 300) / 2
});

test("an override can fill a month that was never scraped", () => {
  const j = job();
  j.listings[URL_A].months = [{ month: "2026-02", adr: 200, samples: 3, notes: "" }];
  const s = buildSummary({ ...j, overrides: { [cellKey(URL_A, 0)]: 250 } });
  assert.equal(s.rows[0].scrapedByMonth[0], null);
  assert.equal(s.rows[0].adrByMonth[0], 250);
  assert.equal(s.rows[0].avgAdr, 225); // (250 + 200) / 2
});

test("clearing an override restores the scraped value", () => {
  const withOverride = buildSummary(job({ overrides: { [cellKey(URL_A, 0)]: 500 } }));
  assert.equal(withOverride.rows[0].adrByMonth[0], 500);
  const cleared = buildSummary(job({ overrides: {} }));
  assert.equal(cleared.rows[0].adrByMonth[0], 100);
  assert.equal(cleared.rows[0].avgAdr, 150);
});

test("an excluded cell is dropped from averages even when overridden", () => {
  const s = buildSummary(
    job({
      overrides: { [cellKey(URL_A, 0)]: 500 },
      excluded: new Set([cellKey(URL_A, 0)]),
    })
  );
  assert.equal(s.rows[0].adrByMonth[0], 500, "value still shown, struck through");
  assert.equal(s.rows[0].excludedByMonth[0], true);
  assert.equal(s.rows[0].avgAdr, 200, "only the February 200 counts");
  assert.equal(s.monthAverages[0], 300, "only listing B's January 300 counts");
});
