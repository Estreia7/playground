import { verifyAdmin } from "../auth";
import { mailConfigured, sendMail, verificationMail } from "../mailer";
import {
  clientIp,
  hashIp,
  hashToken,
  newId,
  newToken,
  throttle,
  validateTicketInput,
  type Ticket,
} from "../ticketsCore";
import { addTicket, listTickets } from "../ticketsStore";

export const dynamic = "force-dynamic";

// Per-process sliding window. Resets on restart — acceptable for a small
// public form whose worst case is a fuller inbox, not a changed number.
const hits = new Map<string, number[]>();

/** Public origin for links in e-mails. In production it must be the
 *  configured site (behind a proxy the request origin is internal); in dev
 *  it is the request itself, so a local walk-through never points at the
 *  live server. */
function siteUrl(request: Request): string {
  const configured = process.env.LFP_SITE_URL;
  if (process.env.NODE_ENV === "production" && configured) return configured.replace(/[/]$/, "");
  return new URL(request.url).origin;
}

/** Public: submit a proposal. It lands as pending_email and only becomes
 *  visible to the admin once the link in the e-mail is opened. */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const v = validateTicketInput(raw);
  if (!v.ok) return Response.json({ error: "Validação falhou", issues: v.errors }, { status: 400 });

  const now = Date.now();
  const salt = process.env.LFP_SESSION_SECRET ?? "lfp";
  const ipHash = hashIp(clientIp(request.headers), salt);
  if (!throttle(hits, ipHash, now)) {
    return Response.json({ error: "Demasiadas submissões. Tenta mais tarde." }, { status: 429 });
  }

  const token = newToken();
  const ticket: Ticket = {
    ...v.value,
    id: newId(),
    status: "pending_email",
    tokenHash: hashToken(token),
    ipHash,
    createdAt: now,
    verifiedAt: null,
    updatedAt: now,
    reply: null,
  };
  await addTicket(ticket);

  const link = `${siteUrl(request)}/api/lfp/tickets/verify?token=${token}`;
  const mail = await sendMail(verificationMail(ticket.email, link, ticket.title));

  // In dev, with no mail key, hand the link back so the flow can be walked
  // end to end. Never in production: the link is the proof of the e-mail.
  const exposeLink = mail.dev && process.env.NODE_ENV !== "production";

  return Response.json(
    {
      id: ticket.id,
      status: ticket.status,
      verificationSent: mail.sent,
      mailConfigured: mailConfigured(),
      ...(exposeLink ? { devLink: link } : {}),
    },
    { status: 201 }
  );
}

/** Admin: the whole inbox, newest first, with counts by status. */
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });
  const tickets = (await listTickets()).sort((a, b) => b.createdAt - a.createdAt);
  const counts: Record<string, number> = {};
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
  // The token hash and ip hash are internal; the admin does not need them.
  const safe = tickets.map(({ tokenHash: _t, ipHash: _i, ...rest }) => rest);
  return Response.json({ tickets: safe, counts, mailConfigured: mailConfigured() });
}
