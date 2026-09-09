import { hashToken } from "../../ticketsCore";
import { updateTicket } from "../../ticketsStore";

export const dynamic = "force-dynamic";

/** The link from the verification e-mail. The token is compared by hash;
 *  a valid one moves the ticket to pending and lands the reader on the
 *  contribution page with a confirmation. Anything else — unknown,
 *  already used, or swept — lands there with a soft failure. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  let ok = false;

  if (token.length >= 32) {
    const h = hashToken(token);
    const t = await updateTicket(
      (x) => x.tokenHash === h && x.status === "pending_email",
      (x) => ({ ...x, status: "pending", verifiedAt: Date.now(), updatedAt: Date.now() })
    );
    ok = t !== null;
  }

  return Response.redirect(new URL(`/lfp/contribuir?verified=${ok ? 1 : 0}`, url.origin), 303);
}
