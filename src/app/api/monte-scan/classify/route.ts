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

    // Be forgiving: strip an accidental data-URL prefix and any whitespace so
    // the base64 the SDK receives is always clean (this was the source of the
    // "string did not match the expected pattern" error).
    const comma = base64.indexOf(",");
    if (base64.startsWith("data:") && comma !== -1) {
      const header = base64.slice(5, comma); // e.g. image/jpeg;base64
      const mt = header.split(";")[0];
      if (mt) mediaType = mt;
      base64 = base64.slice(comma + 1);
    }
    base64 = base64.replace(/\s/g, "");

    const media = (ALLOWED.includes(mediaType as MediaType)
      ? mediaType
      : "image/jpeg") as MediaType;

    // Guard against payloads the vision API will reject (~5MB per image).
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > 4.5 * 1024 * 1024) {
      return Response.json(
        { error: "Image is too large — try again (it will be downscaled)." },
        { status: 413 }
      );
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
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
              text: `You are the document classifier for a scanning app. Look at this scanned page and return ONLY a JSON object (no markdown fences, no prose) with exactly these keys:
{
  "docType": one of "id_card" | "passport" | "drivers_license" | "invoice" | "receipt" | "contract" | "letter" | "business_card" | "certificate" | "photo" | "other",
  "label": short human-readable label (e.g. "Cartão de Cidadão", "EDP Invoice", "Rental Contract"),
  "suggestedName": filesystem-safe slug, lowercase, hyphen-separated, no extension, max 6 words (e.g. "cartao-cidadao-joao-silva"),
  "orientation": "portrait" | "landscape",
  "confidence": number 0-1,
  "summary": one short sentence describing the document,
  "tags": array of 1-4 short lowercase keyword tags
}
If you cannot read it, use docType "other", a generic label, and confidence below 0.4. Never invent personal data that is not visible.`,
            },
          ],
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          result = JSON.parse(match[0]);
        } catch {
          result = null;
        }
      }
    }

    if (!result || typeof result !== "object") {
      // Never hard-fail the UX: return a safe "unknown" classification.
      return Response.json({
        classification: {
          docType: "other",
          label: "Document",
          suggestedName: "scan",
          orientation: "portrait",
          confidence: 0,
          summary: "Could not auto-detect the document type.",
          tags: [],
        },
        degraded: true,
      });
    }

    return Response.json({ classification: result });
  } catch (err: unknown) {
    const msg =
      err instanceof Anthropic.APIError
        ? `Vision API error (${err.status}): ${err.message}`
        : err instanceof Error
        ? err.message
        : "Unknown error";
    console.error("Monte Scan classify error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
