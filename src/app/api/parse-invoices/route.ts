import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { images } = (await request.json()) as {
      images: { base64: string; mediaType: string }[];
    };

    if (!images?.length) {
      return Response.json({ error: "No images provided" }, { status: 400 });
    }

    const imageBlocks: Anthropic.Messages.ImageBlockParam[] = images.map(
      (img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          data: img.base64,
        },
      })
    );

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Analyze these invoice(s) and extract the following data for EACH invoice as a JSON array.

For each invoice return an object with:
- "invoice_number": string (the invoice/document number)
- "date": string (date in DD/MM/YYYY format)
- "client_name": string (client or supplier name)
- "client_nif": string (NIF/VAT number of the client, or "" if not found)
- "items": array of { "description": string, "quantity": number, "unit_price": number, "total": number }
- "subtotal": number (amount before VAT)
- "vat_rate": number (VAT percentage, e.g. 23)
- "vat_amount": number (VAT value)
- "total": number (total amount with VAT)
- "payment_method": string (e.g. "Transferência", "Multibanco", "Numerário", or "" if unknown)

Return ONLY the JSON array, no markdown, no explanation. If a field cannot be found, use "" for strings and 0 for numbers. Always return an array even for a single invoice.`,
            },
          ],
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the JSON from Claude's response
    let invoices;
    try {
      // Try direct parse first, then try extracting from markdown code block
      invoices = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        invoices = JSON.parse(match[0]);
      } else {
        return Response.json(
          { error: "Failed to parse invoice data", raw: text },
          { status: 422 }
        );
      }
    }

    return Response.json({ invoices });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Invoice parsing error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
