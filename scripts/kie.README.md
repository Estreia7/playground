# kie.mjs — KIE.ai image generation

A single-file client for KIE.ai's image API. Copy `kie.mjs` into any
project; it imports nothing but Node itself, with `sharp` optional.

Everything here was **probed against the live API**, not read from the
docs — kie.ai's public documentation covers only credit and download
helpers, and does not publish the generation endpoints at all.

## Setup

```bash
echo "KIE_API_KEY=your-key-here" >> .env.local   # already git-ignored
```

The key is read from `process.env.KIE_API_KEY` first, then `.env.local`.

Note that a key can be **scoped to specific models** in the kie.ai
dashboard. A key authorised for one model rejects every other one, so
check the dashboard before blaming your code.

## Use

```js
import { generate, credit } from "./kie.mjs";

console.log(await credit());          // 180

await generate({
  prompt: "a lighthouse on a cliff, flat vector, muted blue",
  ratio: "3:2",
  width: 800,                          // resize + WebP, needs sharp
  file: "public/hero.webp",
});
```

A whole set, skipping what already exists:

```js
import { generateSet } from "./kie.mjs";

await generateSet(
  [
    { slug: "hero", ratio: "16:9", width: 1600, prompt: "…" },
    { slug: "about", ratio: "3:2", prompt: "…" },
  ],
  { outDir: "public/img", style: SHARED_STYLE_PREAMBLE }
);
```

## API surface

| Function | Does |
|---|---|
| `credit(key?)` | Remaining credits. Worth calling before a batch. |
| `models(key?)` | All 206 marketplace models. |
| `textToImageModels(key?)` | Just the text-to-image ones (32 at the time of writing). |
| `createTask({prompt, ratio, model, input, key})` | Starts a job → `taskId`. |
| `waitForTask(taskId, {onTick})` | Polls to completion → `{urls, costTime}`. |
| `download(url, file, {ratio, width})` | Fetches, verifies, writes. |
| `generate({prompt, file, ratio, width, style})` | All of the above in one call. |
| `generateSet(items, {outDir, style, force})` | A batch, sequential, resumable. |
| `pngSize(buf)` | `{w, h}` from PNG headers, or `null` if not a PNG. |

## The endpoints

Base `https://api.kie.ai/api/v1`, auth `Authorization: Bearer <key>`.

| Path | Method | Notes |
|---|---|---|
| `/chat/credit` | GET | `data` is a bare number |
| `/models` | GET | `data.models[]` |
| `/jobs/createTask` | POST | `{model, input:{prompt, aspect_ratio}}` → `data.taskId` |
| `/jobs/recordInfo?taskId=` | GET | `data.state`: `generating` \| `success` \| `fail` |

**It is asynchronous.** Create, then poll. Roughly **60 seconds** per
image.

## Four things that will bite you

**1. HTTP 200 does not mean success.** The API answers 200 at the
transport layer and puts the real status in a `code` field. Checking
`response.ok` alone misses every failure. This module checks `code`.

**2. `image_size` is accepted and then silently ignored.** Ask for
`"3:2"` through it and you get a square, with no error anywhere. The
field that works is **`aspect_ratio`**. Probed across five spellings:

| Field | Result |
|---|---|
| `image_size: "3:2"` | 1254×1254 ✗ |
| `image_size: "landscape"` | 1254×1254 ✗ |
| `image_size: "1536x1024"` | 1254×1254 ✗ |
| **`aspect_ratio: "3:2"`** | **1536×1024 ✓** |
| `size: "1536x1024"` | 1254×1254 ✗ |

Because of this, `download()` verifies the dimensions it gets back rather
than trusting them.

**3. `resultJson` is a string, not an object.** It needs parsing:

```js
const urls = JSON.parse(d.resultJson).resultUrls;
```

**4. The PNGs are around 2 MB each.** Fine as a source, far too heavy for
a page. Pass `width` with a `.webp` filename and the module resizes and
converts — a set of six went from 12.9 MB to 613 KB. Without `sharp`
installed it writes the PNG instead and tells you it did.

## Costs — GPT Image 2.5

| Resolution | Credits | ≈ USD |
|---|---|---|
| 1K | 6 | $0.03 |
| 2K | 10 | $0.05 |
| 4K | 16 | $0.08 |

## Prompting

Use one `style` preamble across a set. It does more for coherence than
any per-image wording — without it you get several separate commissions
rather than one.

If the model returns a decorative frame with your subject small inside
it, say so explicitly. This fixed it here:

> "The subject fills most of the frame and is the clear focus. Plain
> uncluttered background — no decorative corner flourishes, no borders,
> no framing pattern."

## Generate once, commit the result

The runtime should never call this API. A file on disk costs nothing per
view, cannot fail on a slow night, and looks the same for everyone.
Keep the generator script in the repo so the set can be reproduced or
extended, and commit the images it produces.
