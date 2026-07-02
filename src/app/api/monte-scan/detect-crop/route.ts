import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const ALLOWED: MediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "Server is missing ANTHROPIC_API_KEY" },
        { status: 500 }
      );
    }

    let { base64, mediaType } = (await request.json()) as {
      base64?: string;
      mediaType?: string;
    };

    if (!base64) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    // Strip any data-URL prefix / whitespace before the SDK sees the base64.
    const comma = base64.indexOf(",");
    if (base64.startsWith("data:") && comma !== -1) {
      const mt = base64.slice(5, comma).split(";")[0];
      if (mt) mediaType = mt;
      base64 = base64.slice(comma + 1);
    }
    base64 = base64.replace(/\s/g, "");

    const media = (ALLOWED.includes(mediaType as MediaType)
      ? mediaType
      : "image/jpeg") as MediaType;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media, data: base64 },
            },
            {
              type: "text",
              text: `This photo contains a single document, card, or paper sheet against a background. Return the tight bounding box of ONLY the document (exclude the background/surface around it).

Return ONLY this JSON, with all values as fractions of the image dimensions between 0 and 1 (no markdown, no prose):
{ "x": left edge, "y": top edge, "w": width, "h": height, "found": true|false }

- (x, y) is the top-left corner; w and h are the box size, all normalized 0-1.
- x + w must be <= 1 and y + h must be <= 1.
- Include the whole document but crop out surrounding desk/table/hands.
- If no clear document fills a meaningful part of the frame, set "found": false and return the full frame {x:0,y:0,w:1,h:1}.`,
            },
          ],
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    let box: {
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      found?: boolean;
    } | null = null;
    try {
      box = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          box = JSON.parse(m[0]);
        } catch {
          box = null;
        }
      }
    }

    if (
      !box ||
      typeof box.x !== "number" ||
      typeof box.y !== "number" ||
      typeof box.w !== "number" ||
      typeof box.h !== "number"
    ) {
      return Response.json({ crop: { x: 0, y: 0, w: 1, h: 1, found: false } });
    }

    // Clamp to valid normalized ranges.
    const x = clamp01(box.x);
    const y = clamp01(box.y);
    const w = clamp01(box.w);
    const h = clamp01(box.h);
    const crop = {
      x,
      y,
      w: Math.min(w, 1 - x),
      h: Math.min(h, 1 - y),
      found: box.found !== false,
    };

    return Response.json({ crop });
  } catch (err: unknown) {
    const msg =
      err instanceof Anthropic.APIError
        ? `Vision API error (${err.status}): ${err.message}`
        : err instanceof Error
        ? err.message
        : "Unknown error";
    console.error("Monte Scan detect-crop error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
