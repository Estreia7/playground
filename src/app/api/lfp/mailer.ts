/* Transactional e-mail through Brevo's HTTP API — plain fetch, no SDK.
   Contract verified against the current Brevo docs:
     POST https://api.brevo.com/v3/smtp/email
     headers: api-key, content-type: application/json
     body: { sender, to, subject, htmlContent, textContent }

   With no BREVO_API_KEY the message is written to the server console and
   reported as not sent, so the whole ticket flow is exercisable in dev and
   becomes real the moment the key is set. */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  sent: boolean;
  /** True when no key is configured and the mail went to the console. */
  dev: boolean;
  status?: number;
  error?: string;
}

export function mailConfigured(): boolean {
  return !!process.env.BREVO_API_KEY;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.log(`[lfp mailer] not configured — would send to ${mail.to}\n  ${mail.subject}\n  ${mail.text}`);
    return { sent: false, dev: true };
  }

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL ?? "lfp@bruno-dev.xyz",
          name: process.env.BREVO_SENDER_NAME ?? "LFP",
        },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ["lfp"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { sent: false, dev: false, status: r.status, error: body.slice(0, 300) };
    }
    return { sent: true, dev: false, status: r.status };
  } catch (e) {
    return { sent: false, dev: false, error: (e as Error).message };
  }
}

/** The one e-mail the public flow sends. Plain, no tracking, one link. */
export function verificationMail(to: string, link: string, title: string): Mail {
  const text = [
    "Recebemos a tua proposta para o LFP — Literacia Financeira Portuguesa:",
    `«${title}»`,
    "",
    "Para a confirmares, abre esta ligação:",
    link,
    "",
    "Se não foste tu, ignora este e-mail: a proposta é apagada em 48 horas.",
  ].join("\n");
  const html = `<p>Recebemos a tua proposta para o <strong>LFP — Literacia Financeira Portuguesa</strong>:</p>
<p>«${escapeHtml(title)}»</p>
<p>Para a confirmares, abre esta ligação:<br><a href="${link}">${link}</a></p>
<p style="color:#5A6B80">Se não foste tu, ignora este e-mail: a proposta é apagada em 48 horas.</p>`;
  return { to, subject: "Confirma a tua proposta — LFP", text, html };
}

/** Sent when the admin replies to a ticket. */
export function replyMail(to: string, title: string, status: string, reply: string): Mail {
  const text = [`Sobre a tua proposta «${title}» (estado: ${status}):`, "", reply, "", "— LFP, Literacia Financeira Portuguesa"].join("\n");
  const html = `<p>Sobre a tua proposta «${escapeHtml(title)}» (estado: <strong>${escapeHtml(status)}</strong>):</p>
<p style="white-space:pre-wrap">${escapeHtml(reply)}</p>
<p style="color:#5A6B80">— LFP, Literacia Financeira Portuguesa</p>`;
  return { to, subject: `Resposta à tua proposta — LFP`, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
