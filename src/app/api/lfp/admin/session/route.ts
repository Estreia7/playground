import { verifyAdmin } from "../../auth";
import { mailConfigured } from "../../mailer";

export const dynamic = "force-dynamic";

/** Is the caller logged in? Also tells the admin UI whether an admin is
 *  configured at all and whether e-mail is wired, so it can say so
 *  instead of failing quietly later. */
export async function GET(request: Request) {
  const authenticated = await verifyAdmin(request);
  return Response.json({
    authenticated,
    configured: !!(process.env.LFP_ADMIN_USER && process.env.LFP_ADMIN_PASSWORD),
    mailConfigured: mailConfigured(),
  });
}
