import { verifyAdmin } from "../../auth";
import { replyMail, sendMail } from "../../mailer";
import { canTransition, TICKET_STATUSES, type TicketStatus } from "../../ticketsCore";
import { removeTicket, updateTicket } from "../../ticketsStore";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Admin: change status and/or reply. A reply is e-mailed to the submitter
 *  when mail is configured. Transitions follow the lifecycle table. */
export async function PATCH(request: Request, ctx: Ctx) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });
  const { id } = await ctx.params;

  let body: { status?: unknown; reply?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const status = body.status;
  if (status !== undefined && !(TICKET_STATUSES as readonly unknown[]).includes(status)) {
    return Response.json({ error: "Estado desconhecido" }, { status: 400 });
  }
  const reply = typeof body.reply === "string" ? body.reply.trim().slice(0, 4000) : undefined;

  let rejected: string | null = null;
  const updated = await updateTicket(
    (t) => t.id === id,
    (t) => {
      if (status !== undefined && status !== t.status && !canTransition(t.status, status as TicketStatus)) {
        rejected = `${t.status} → ${status}`;
        return t;
      }
      return {
        ...t,
        status: status !== undefined ? (status as TicketStatus) : t.status,
        reply: reply !== undefined ? reply || null : t.reply,
        updatedAt: Date.now(),
      };
    }
  );

  if (!updated) return Response.json({ error: "Ticket não encontrado" }, { status: 404 });
  if (rejected) return Response.json({ error: `Transição não permitida: ${rejected}` }, { status: 409 });

  let mailed = false;
  if (reply && updated.status !== "pending_email") {
    const r = await sendMail(replyMail(updated.email, updated.title, updated.status, reply));
    mailed = r.sent;
  }

  const { tokenHash: _t, ipHash: _i, ...safe } = updated;
  return Response.json({ ticket: safe, mailed });
}

/** Admin: delete — for spam, or on request from the submitter. */
export async function DELETE(request: Request, ctx: Ctx) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });
  const { id } = await ctx.params;
  const ok = await removeTicket(id);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "Ticket não encontrado" }, { status: 404 });
}
