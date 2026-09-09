"use client";

import { useEffect, useState } from "react";
import { tr } from "../i18n";
import { ChoiceGroup } from "../ui/Inputs";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";

type Kind = "dados" | "conteudo" | "pergunta" | "outro";
const KINDS: Kind[] = ["dados", "conteudo", "pergunta", "outro"];

type Outcome =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; email: string; devLink?: string }
  | { state: "error"; message: string };

export default function ContribuirView() {
  const { t } = useLfpLang();
  const c = t.admin.contribuir;

  const [kind, setKind] = useState<Kind>("dados");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — people never see it
  const [outcome, setOutcome] = useState<Outcome>({ state: "idle" });
  const [verified, setVerified] = useState<"1" | "0" | null>(null);

  // The verification link lands here with ?verified=1|0. Read after mount.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("verified");
    if (v === "1" || v === "0") setVerified(v);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOutcome({ state: "sending" });
    try {
      const r = await fetch("/api/lfp/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, target, title, body, sourceUrl, email, website }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) return setOutcome({ state: "error", message: c.tooMany });
      if (!r.ok) return setOutcome({ state: "error", message: j.issues ? `${c.failed} ${j.issues.join("; ")}` : c.failed });
      setOutcome({ state: "sent", email, devLink: j.devLink });
    } catch {
      setOutcome({ state: "error", message: c.failed });
    }
  };

  const reset = () => {
    setOutcome({ state: "idle" });
    setTitle("");
    setBody("");
    setSourceUrl("");
    setTarget("");
  };

  const field = "lfp-input w-full px-3 py-2.5 text-base";
  const label = "block text-sm font-medium";
  const hint = "mt-1 text-xs text-[var(--lfp-mist)]";

  return (
    <Shell crumbs={[{ label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {verified === "1" && (
        <p role="status" className="mb-6 rounded-lg border border-[var(--lfp-verde)] bg-[var(--lfp-verde-dim)] px-4 py-3 text-sm font-medium text-[var(--lfp-verde)]">
          {c.verifiedOk}
        </p>
      )}
      {verified === "0" && (
        <p role="status" className="mb-6 rounded-lg border border-[var(--lfp-ouro)] px-4 py-3 text-sm text-[var(--lfp-cobalt-deep)]">
          {c.verifiedFail}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        {outcome.state === "sent" ? (
          <section className="lfp-panel p-6" role="status">
            <p className="lfp-eyebrow">{outcome.devLink ? c.sentDevTitle : c.sentTitle}</p>
            <p className="mt-2 leading-relaxed">
              {outcome.devLink ? c.sentDevBody : tr(c.sentBody, { email: outcome.email })}
            </p>
            {outcome.devLink && (
              <a href={outcome.devLink} className="lfp-focus lfp-num mt-3 inline-flex min-h-11 items-center break-all text-sm text-[var(--lfp-cobalt)] underline underline-offset-2">
                {outcome.devLink}
              </a>
            )}
            <button type="button" onClick={reset} className="lfp-focus lfp-press mt-5 min-h-11 rounded-lg border border-[var(--lfp-line)] px-4 text-sm hover:border-[var(--lfp-cobalt)]">
              {c.another}
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="lfp-panel space-y-5 p-6" aria-label={c.title}>
            <ChoiceGroup
              label={c.fields.kind}
              value={kind}
              onChange={setKind}
              columns={2}
              choices={KINDS.map((k) => ({ value: k, label: c.fields.kinds[k] }))}
            />
            <div>
              <label htmlFor="ct-target" className={label}>{c.fields.target}</label>
              <input id="ct-target" className={`${field} mt-1.5`} value={target} onChange={(e) => setTarget(e.target.value)} maxLength={120} required aria-describedby="ct-target-h" />
              <p id="ct-target-h" className={hint}>{c.fields.targetHint}</p>
            </div>
            <div>
              <label htmlFor="ct-title" className={label}>{c.fields.title}</label>
              <input id="ct-title" className={`${field} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            </div>
            <div>
              <label htmlFor="ct-body" className={label}>{c.fields.body}</label>
              <textarea id="ct-body" className={`${field} mt-1.5 min-h-40 font-[inherit]`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} required aria-describedby="ct-body-h" />
              <p id="ct-body-h" className={hint}>{c.fields.bodyHint}</p>
            </div>
            <div>
              <label htmlFor="ct-source" className={label}>{c.fields.sourceUrl}</label>
              <input id="ct-source" type="url" inputMode="url" className={`${field} mt-1.5`} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} maxLength={500} required pattern="https://.*" aria-describedby="ct-source-h" />
              <p id="ct-source-h" className={hint}>{c.fields.sourceHint}</p>
            </div>
            <div>
              <label htmlFor="ct-email" className={label}>{c.fields.email}</label>
              <input id="ct-email" type="email" inputMode="email" autoComplete="email" className={`${field} mt-1.5`} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required aria-describedby="ct-email-h" />
              <p id="ct-email-h" className={hint}>{c.fields.emailHint}</p>
            </div>
            {/* Honeypot: off-screen and untabbable. Bots fill it; people can't. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
              <label htmlFor="ct-website">Website</label>
              <input id="ct-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {outcome.state === "error" && (
              <p role="alert" className="rounded-lg border border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho-dim)] px-4 py-2.5 text-sm text-[var(--lfp-vermelho)]">
                {outcome.message}
              </p>
            )}

            <button
              type="submit"
              disabled={outcome.state === "sending"}
              className="lfp-focus lfp-press min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)] disabled:opacity-60"
            >
              {outcome.state === "sending" ? c.sending : c.submit}
            </button>
          </form>
        )}

        <aside className="lfp-tile p-6">
          <p className="lfp-eyebrow">{c.howTitle}</p>
          <ol className="mt-3 space-y-3">
            {c.how.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="lfp-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--lfp-cobalt)] text-xs font-semibold text-[var(--lfp-cobalt)]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Shell>
  );
}
