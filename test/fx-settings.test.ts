import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSettings,
  mergeSettings,
  DEFAULT_SETTINGS,
} from "../src/app/api/fx/settings.ts";

/* Settings validation is the only thing standing between a typo in a form and
   a scan whose numbers quietly stop meaning anything, so it has to reject the
   genuinely broken values and — just as importantly — stay quiet about the
   fields a partial update never mentioned. */

test("the defaults pass their own validation", () => {
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS), []);
});

test("a partial update is judged only on the fields it carries", () => {
  // A form that saves one section at a time must not be told that every other
  // field "must be a number".
  const issues = validateSettings({ rules: { rsiLength: 21 } });
  assert.deepEqual(issues, [], "unexpected complaints: " + JSON.stringify(issues));
});

test("an out-of-range value is rejected with a readable message", () => {
  const issues = validateSettings({ rules: { rsiLength: 1 } });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /RSI length must be between 2 and 100/);
});

test("a MACD fast length at or above the slow length is refused", () => {
  const issues = validateSettings({ rules: { macdFast: 30, macdSlow: 10 } });
  assert.ok(issues.some((i) => /fast length must be shorter/.test(i)));
});

test("overlapping RSI thresholds are refused", () => {
  const issues = validateSettings({ rules: { rsiOversold: 80, rsiOverbought: 60 } });
  assert.ok(issues.some((i) => /oversold level must sit below/.test(i)));
});

test("score weights are only totalled when every component is present", () => {
  // Half a weights object is merged over the stored values, so totalling it
  // would compare against numbers the caller never sent.
  const partial = validateSettings({ weights: { similarity: 90 } });
  assert.deepEqual(partial, [], "a partial weights update should not be totalled");

  const complete = validateSettings({
    weights: { similarity: 90, momentum: 90, candle: 10, htf: 10, volatility: 5 },
  });
  assert.ok(
    complete.some((i) => /add up to 205/.test(i)),
    "a complete set above 100 must be refused",
  );
});

test("a minimum score above the alert threshold is refused as unreachable", () => {
  const issues = validateSettings({ alertThreshold: 50, minScore: 80 });
  assert.ok(issues.some((i) => /no alert could ever fire/.test(i)));
});

test("a non-integer is refused where only whole numbers make sense", () => {
  const issues = validateSettings({ similarity: { window: 12.5 } });
  assert.ok(issues.some((i) => /whole number/.test(i)));
});

test("a payload that is not an object is refused outright", () => {
  assert.deepEqual(validateSettings(null), ["The payload must be an object."]);
  assert.deepEqual(validateSettings("nonsense"), ["The payload must be an object."]);
});

test("merging keeps the untouched sections intact", () => {
  const merged = mergeSettings(DEFAULT_SETTINGS, { rules: { rsiLength: 21 } as never });

  assert.equal(merged.rules.rsiLength, 21, "the changed field is applied");
  assert.equal(
    merged.rules.rsiOversold,
    DEFAULT_SETTINGS.rules.rsiOversold,
    "its siblings survive",
  );
  assert.deepEqual(
    merged.similarity,
    DEFAULT_SETTINGS.similarity,
    "untouched sections are unchanged",
  );
  assert.equal(merged.alertThreshold, DEFAULT_SETTINGS.alertThreshold);
});
