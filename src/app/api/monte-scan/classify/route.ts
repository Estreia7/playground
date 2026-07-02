import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function POST(request: Request) {
  try {
    const { base64, mediaType } = (await request.json()) as {
      base64: string;
      mediaType: MediaType;
    };

    if (!base64) {
      return Response.json({ error: "No image provided" }, { status: 400 });
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
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `You are the document classifier for a scanning app. Look at this scanned page and return a JSON object describing it.

Return ONLY this JSON (no markdown, no prose):
{
  "docType": one of "id_card" | "passport" | "drivers_license" | "invoice" | "receipt" | "contract" | "letter" | "business_card" | "certificate" | "photo" | "other",
  "label": a short human-readable label (e.g. "Cartão de Cidadão", "EDP Invoice", "Rental Contract"),
  "suggestedName": a filesystem-safe slug for the PDF WITHOUT extension, lowercase, hyphen-separated, max 6 words (e.g. "cartao-cidadao-joao-silva"),
  "orientation": "portrait" | "landscape",
  "confidence": a number 0-1,
  "summary": one short sentence describing the document contents,
  "tags": array of 1-4 short lowercase keyword tags
}

If you cannot read the document, use docType "other", a generic label, and confidence below 0.4. Never invent personal data that is not visible.`,
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
        result = JSON.parse(match[0]);
      } else {
        return Response.json(
          { error: "Failed to parse classification", raw: text },
          { status: 422 }
        );
      }
    }

    return Response.json({ classification: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Monte Scan classify error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
