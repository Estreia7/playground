import { test } from "node:test";
import assert from "node:assert/strict";
import { arrange, displayName, historyOf, merge, normalize, value, type Racket } from "../src/app/padel/rackets/catalog.ts";
import { parseToolReply, pool } from "../src/app/api/padel/rackets/padelful.ts";

/* A record as Padelful's REST list and get_racket return it (trimmed). */
const full = {
  slug: "dunlop-galactica-os-lite-2025",
  title: "Dunlop Galactica OS Lite 2025 Review",
  model: "Dunlop Galactica OS Lite 2025",
  brand: "Dunlop",
  season: 2025,
  pvp: 210,
  ratings: { power: 8, control: 9.5, rebound: 9, maneuverability: 9.5, sweetSpot: 9.5 },
  rating: "9.0",
  materials: { frame: "", core: "Soft EVA", faces: "Carbon 12K" },
  feel: "",
  shape: "Round",
  weight: [345, 360],
  image: "/images/rackets/dunlop-galactica-os-lite-2025.png",
  url: "/en/rackets/dunlop-galactica-os-lite-2025",
};

const racket = (over: Partial<Racket>): Racket => ({ ...(normalize(full) as Racket), ...over });

test("a raw Padelful record becomes numbers, nulls and absolute links", () => {
  const r = normalize(full)!;
  assert.equal(r.name, "Galactica OS Lite");
  assert.equal(r.rating, 9);
  assert.equal(r.price, 210);
  assert.equal(r.shape, "round");
  assert.equal(r.feel, null, "an empty string means unknown");
  assert.deepEqual(r.weight, [345, 360]);
  assert.equal(r.ratings?.control, 9.5);
  assert.equal(r.image, "https://www.padelful.com/images/rackets/dunlop-galactica-os-lite-2025.png");
  assert.equal(r.url, "https://www.padelful.com/en/rackets/dunlop-galactica-os-lite-2025");
});

test("loose records: Tear shape, empty weight, no price, no ratings, no image", () => {
  const r = normalize({ slug: "set-geri-2025", model: "Set Geri 2025", brand: "Set", season: 2025, rating: "8.8", shape: "Tear", weight: [], pvp: null })!;
  assert.equal(r.shape, "tear");
  assert.equal(r.weight, null);
  assert.equal(r.price, null);
  assert.equal(r.ratings, null);
  assert.equal(r.image, "https://www.padelful.com/images/rackets/set-geri-2025.png", "recommendations leave the image out");
  assert.equal(normalize({ slug: "x", season: 2025 }), null, "no rating, nothing to rank by");
});

test("names lose the brand and the year, wherever the year sits", () => {
  assert.equal(displayName("Star Vie Shade 2027", "Star Vie", 2027), "Shade");
  assert.equal(displayName("Bullpadel XPLO 2025 Di Nenno", "Bullpadel", 2025), "XPLO Di Nenno");
  assert.equal(displayName("Technical Viper", "Babolat", 2025), "Technical Viper");
});

test("a search summary keeps its image when the full record has none", () => {
  const summary = racket({ price: null, ratings: null, image: "https://www.padelful.com/a.png" });
  const detail = racket({ price: 199, image: null });
  const m = merge(summary, detail);
  assert.equal(m.price, 199);
  assert.equal(m.image, "https://www.padelful.com/a.png");
  assert.equal(merge(summary, null), summary);
});

test("value rewards rating above 7.5 per euro, not cheapness alone", () => {
  const top = racket({ rating: 9, price: 210 });
  const mid = racket({ rating: 8, price: 100 });
  const cheap = racket({ rating: 7.5, price: 40 });
  assert.ok(value(top) > value(mid));
  assert.equal(value(cheap), 0);
  assert.equal(value(racket({ price: null })), 0);
});

test("arrange filters by shape and budget and sorts three ways", () => {
  const list = [
    racket({ slug: "a", rating: 9, price: 210, shape: "round" }),
    racket({ slug: "b", rating: 8.5, price: 120, shape: "diamond" }),
    racket({ slug: "c", rating: 8.8, price: null, shape: "round" }),
    racket({ slug: "d", rating: 8.5, price: 90, shape: "tear" }),
  ];
  assert.deepEqual(arrange(list, {}).map((r) => r.slug), ["a", "c", "d", "b"], "rating, then cheaper first");
  assert.deepEqual(arrange(list, { sort: "price" }).map((r) => r.slug), ["d", "b", "a"], "no price, not in a price list");
  assert.deepEqual(arrange(list, { maxPrice: 150 }).map((r) => r.slug), ["d", "b"]);
  assert.deepEqual(arrange(list, { shape: "round" }).map((r) => r.slug), ["a", "c"]);
  assert.deepEqual(arrange(list, { sort: "value" }).map((r) => r.slug), ["d", "b", "a"]);
});

test("price history keeps one point per change, oldest first", () => {
  const snapshots = {
    "2026-11": { a: 180 },
    "2026-09": { a: 210, b: 99 },
    "2026-10": { a: 210 },
  };
  assert.deepEqual(historyOf("a", snapshots), [
    { month: "2026-09", price: 210 },
    { month: "2026-11", price: 180 },
  ]);
  assert.deepEqual(historyOf("zzz", snapshots), []);
});

test("an MCP reply is read out of its event stream", () => {
  const body =
    'event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"found\\":true,\\"racket\\":{\\"slug\\":\\"x\\"}}"}]},"jsonrpc":"2.0","id":1}\n\n';
  assert.deepEqual(parseToolReply(body), { found: true, racket: { slug: "x" } });
  assert.throws(() => parseToolReply('data: {"error":{"message":"nope"}}'), /nope/);
});

test("pool runs everything, never more than its limit at once", async () => {
  let running = 0;
  let peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});
