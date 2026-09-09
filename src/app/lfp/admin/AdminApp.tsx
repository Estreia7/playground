"use client";

/* The backoffice. Everything here is a thin client over the admin routes:
   the server is the only gate (every mutating route checks the cookie), so
   this component never decides what is allowed — it asks, and shows the
   answer. JSON editors are deliberate: the datasets are small, the
   validator on the server is the safety net, and a form per dataset shape
   would be more code than the data. */

import { useCallback, useEffect, useState } from "react";
import { shortDate } from "../format";
import { tr } from "../i18n";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";

type Tab = "estado" | "tickets" | "dados" | "quiz" | "precos";
const TABS: Tab[] = ["estado", "tickets", "dados", "quiz", "precos"];

const TAX_IDS = ["irs", "tsu", "iva", "irc", "independentes", "habitacao", "reforma"] as const;
type TaxId = (typeof TAX_IDS)[number];

type TicketStatus = "pending_email" | "pending" | "accepted" | "rejected" | "applied";
interface Ticket {
  id: string;
  kind: string;
  target: string;
  title: string;
  body: string;
  sourceUrl: string;
  email: string;
  status: TicketStatus;
  createdAt: number;
  verifiedAt: number | null;
  updatedAt: number;
  reply: string | null;
}

interface PriceItem {
  id: string;
  label: { pt: string; en: string };
  price: number;
  currency: "EUR";
  sourceUrl: string;
  capturedAt: string;
}

interface Session {
  authenticated: boolean;
  configured: boolean;
  mailConfigured: boolean;
}

/* ---------- small shared bits ---------- */

const btn = "lfp-focus lfp-press inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors";
const btnPrimary = `${btn} bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)] disabled:opacity-60`;
const btnGhost = `${btn} border border-[var(--lfp-line)] hover:border-[var(--lfp-cobalt)] disabled:opacity-60`;
const btnDanger = `${btn} border border-[var(--lfp-vermelho)] text-[var(--lfp-vermelho)] hover:bg-[var(--lfp-vermelho-dim)]`;
const field = "lfp-input w-full px-3 py-2.5 text-base";
const mono = "lfp-input lfp-num w-full min-h-[28rem] px-3 py-2.5 text-xs leading-relaxed";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; version: number }
  | { kind: "invalid"; issues: string[] }
  | { kind: "failed"; error: string };

function SaveNotice({ state }: { state: SaveState }) {
  const { t } = useLfpLang();
  const c = t.admin.admin.common;
  if (state.kind === "idle" || state.kind === "saving") return null;
  if (state.kind === "saved") {
    return (
      <p role="status" className="rounded-lg border border-[var(--lfp-verde)] bg-[var(--lfp-verde-dim)] px-4 py-2.5 text-sm font-medium text-[var(--lfp-verde)]">
        {tr(c.saved, { version: state.version })}
      </p>
    );
  }
  if (state.kind === "failed") {
    return (
      <p role="alert" className="rounded-lg border border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho-dim)] px-4 py-2.5 text-sm text-[var(--lfp-vermelho)]">
        {tr(c.failed, { error: state.error })}
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-lg border border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho-dim)] px-4 py-3 text-sm text-[var(--lfp-vermelho)]">
      <p className="font-medium">{c.invalid}</p>
      <ul className="lfp-num mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {state.issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

async function putJson(url: string, body: unknown): Promise<SaveState> {
  try {
    const r = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { kind: "saved", version: j.version ?? 0 };
    const issues: string[] =
      j.issues ?? (j.rejected ? j.rejected.map((x: { id: string; errors: string[] }) => `${x.id}: ${x.errors.join("; ")}`) : null);
    if (issues) return { kind: "invalid", issues };
    return { kind: "failed", error: j.error ?? `HTTP ${r.status}` };
  } catch (e) {
    return { kind: "failed", error: (e as Error).message };
  }
}

/** A JSON textarea with save. Used for datasets and the quiz bank. */
function JsonEditor({
  url,
  reloadKey,
  hint,
  transform,
  extra,
}: {
  url: string;
  reloadKey: string;
  hint: string;
  /** Turns the GET payload into the document the PUT expects. */
  transform: (payload: unknown) => unknown;
  extra?: (doc: unknown, setDoc: (d: unknown) => void) => React.ReactNode;
}) {
  const { t } = useLfpLang();
  const c = t.admin.admin.common;
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [parseError, setParseError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setState({ kind: "idle" });
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      setText(JSON.stringify(transform(j), null, 2));
      setParseError(null);
    } catch (e) {
      setState({ kind: "failed", error: (e as Error).message });
    } finally {
      setLoading(false);
    }
    // transform is stable per caller; reloadKey is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  let doc: unknown = null;
  try {
    doc = JSON.parse(text);
  } catch {
    doc = null;
  }

  const save = async () => {
    let body: unknown;
    try {
      body = JSON.parse(text);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    setState({ kind: "saving" });
    setState(await putJson(url, body));
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-[var(--lfp-mist)]">{hint}</p>
      {extra && doc !== null && extra(doc, (d) => setText(JSON.stringify(d, null, 2)))}
      <textarea
        aria-label="JSON"
        className={mono}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        disabled={loading}
      />
      {parseError && (
        <p role="alert" className="lfp-num text-sm text-[var(--lfp-vermelho)]">
          JSON: {parseError}
        </p>
      )}
      <SaveNotice state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnPrimary} onClick={save} disabled={loading || state.kind === "saving"}>
          {state.kind === "saving" ? c.saving : c.save}
        </button>
        <button type="button" className={btnGhost} onClick={load} disabled={loading}>
          {c.reload}
        </button>
      </div>
    </div>
  );
}

/* ---------- login ---------- */

function Login({ session, onDone }: { session: Session; onDone: () => void }) {
  const { t } = useLfpLang();
  const l = t.admin.admin.login;
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setWrong(false);
    const r = await fetch("/api/lfp/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setBusy(false);
    if (r.ok) onDone();
    else setWrong(true);
  };

  return (
    <form onSubmit={submit} className="lfp-panel mx-auto max-w-sm space-y-4 p-6" aria-label={l.title}>
      <h2 className="lfp-display text-xl font-semibold">{l.title}</h2>
      {!session.configured && (
        <p role="alert" className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-3 text-sm text-[var(--lfp-cobalt-deep)]">
          {l.notConfigured}
        </p>
      )}
      <div>
        <label htmlFor="ad-user" className="block text-sm font-medium">{l.user}</label>
        <input id="ad-user" className={`${field} mt-1.5`} autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="ad-pass" className="block text-sm font-medium">{l.password}</label>
        <input id="ad-pass" type="password" className={`${field} mt-1.5`} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {wrong && (
        <p role="alert" className="text-sm text-[var(--lfp-vermelho)]">{l.wrong}</p>
      )}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={busy || !session.configured}>
        {l.enter}
      </button>
    </form>
  );
}

/* ---------- estado ---------- */

function Estado({ session }: { session: Session }) {
  const { t, lang } = useLfpLang();
  const e = t.admin.admin.estado;
  const tk = t.admin.admin.tickets;
  const [tax, setTax] = useState<Array<{ id: string; year: number; version: number; lastVerified: string; unverified: boolean }> | null>(null);
  const [econ, setEcon] = useState<Array<{ id: string; year: number; retrievedAt: string; datasetCode: string }> | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch("/api/lfp/data", { cache: "no-store" }).then((r) => r.json()).then((j) => setTax(j.meta.datasets)).catch(() => setTax([]));
    fetch("/api/lfp/econ", { cache: "no-store" }).then((r) => r.json()).then((j) => setEcon(j.meta.datasets)).catch(() => setEcon([]));
    fetch("/api/lfp/tickets", { cache: "no-store" }).then((r) => r.json()).then((j) => setCounts(j.counts ?? {})).catch(() => setCounts({}));
  }, []);

  const thisYear = new Date().getFullYear();
  const h3 = "lfp-eyebrow";
  const card = "lfp-panel p-5";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={card}>
        <h3 className={h3}>{e.taxTitle}</h3>
        <ul className="mt-3 divide-y divide-[var(--lfp-line)]">
          {(tax ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium uppercase">{d.id}</span>
              <span className="lfp-num flex flex-wrap items-center gap-2 text-xs text-[var(--lfp-mist)]">
                <span>{d.year}</span>
                <span>{tr(e.version, { version: d.version })}</span>
                <span>{tr(e.verifiedOn, { date: shortDate(d.lastVerified, lang) })}</span>
                <span className={`rounded border px-1.5 py-0.5 font-medium ${d.unverified ? "border-[var(--lfp-ouro)] text-[var(--lfp-ouro)]" : "border-[var(--lfp-verde)] text-[var(--lfp-verde)]"}`}>
                  {d.unverified ? e.unverified : e.verified}
                </span>
              </span>
              {d.year < thisYear && (
                <span className="basis-full text-xs text-[var(--lfp-ouro)]">{e.stale}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h3 className={h3}>{e.econTitle}</h3>
        <ul className="mt-3 divide-y divide-[var(--lfp-line)]">
          {(econ ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">{d.id} <span className="lfp-num text-xs text-[var(--lfp-mist)]">{d.datasetCode}</span></span>
              <span className="lfp-num text-xs text-[var(--lfp-mist)]">
                {d.year} · {tr(e.retrievedOn, { date: shortDate(d.retrievedAt.slice(0, 10), lang) })}
              </span>
            </li>
          ))}
        </ul>
        <p className="lfp-num mt-3 text-xs text-[var(--lfp-mist)]">{e.syncHint}</p>
      </section>

      <section className={card}>
        <h3 className={h3}>{e.ticketsTitle}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {(["pending_email", "pending", "accepted", "rejected", "applied"] as TicketStatus[]).map((s) => (
            <div key={s}>
              <dt className="text-xs text-[var(--lfp-mist)]">{tk.status[s]}</dt>
              <dd className="lfp-display lfp-num text-2xl font-semibold">{counts?.[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card}>
        <h3 className={h3}>{e.mailTitle}</h3>
        <p className={`mt-3 text-sm leading-relaxed ${session.mailConfigured ? "text-[var(--lfp-verde)]" : "text-[var(--lfp-cobalt-deep)]"}`}>
          {session.mailConfigured ? e.mailOn : e.mailOff}
        </p>
      </section>
    </div>
  );
}

/* ---------- tickets ---------- */

function TicketCard({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const { t, lang } = useLfpLang();
  const tk = t.admin.admin.tickets;
  const [reply, setReply] = useState(ticket.reply ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: { status?: TicketStatus; reply?: string }) => {
    setBusy(true);
    setNote(null);
    const r = await fetch(`/api/lfp/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setNote(tr(t.admin.admin.common.failed, { error: j.error ?? r.status }));
    if (body.reply !== undefined) setNote(j.mailed ? tk.mailed : tk.notMailed);
    onChange();
  };

  const del = async () => {
    if (!window.confirm(tk.confirmDelete)) return;
    setBusy(true);
    await fetch(`/api/lfp/tickets/${ticket.id}`, { method: "DELETE" });
    setBusy(false);
    onChange();
  };

  const s = ticket.status;
  const tone: Record<TicketStatus, string> = {
    pending_email: "border-[var(--lfp-line)] text-[var(--lfp-mist)]",
    pending: "border-[var(--lfp-ouro)] text-[var(--lfp-ouro)]",
    accepted: "border-[var(--lfp-verde)] text-[var(--lfp-verde)]",
    rejected: "border-[var(--lfp-vermelho)] text-[var(--lfp-vermelho)]",
    applied: "border-[var(--lfp-cobalt)] text-[var(--lfp-cobalt)]",
  };

  return (
    <article className="lfp-panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="lfp-display text-lg font-semibold">{ticket.title}</h3>
          <p className="lfp-num mt-1 text-xs text-[var(--lfp-mist)]">
            {shortDate(new Date(ticket.createdAt).toISOString().slice(0, 10), lang)} · {tk.by} {ticket.email} · {ticket.kind} · {tk.target}: {ticket.target}
          </p>
        </div>
        <span className={`rounded border px-2 py-1 text-xs font-medium ${tone[s]}`}>{tk.status[s]}</span>
      </header>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{ticket.body}</p>
      <p className="mt-2 text-xs">
        <span className="text-[var(--lfp-mist)]">{tk.source}: </span>
        <a href={ticket.sourceUrl} target="_blank" rel="noopener noreferrer" className="lfp-focus inline-flex min-h-11 items-center break-all text-[var(--lfp-cobalt)] underline underline-offset-2">
          {ticket.sourceUrl}
        </a>
      </p>

      {s !== "pending_email" && (
        <div className="mt-4">
          <label htmlFor={`rp-${ticket.id}`} className="block text-sm font-medium">{tk.replyLabel}</label>
          <textarea id={`rp-${ticket.id}`} className={`${field} mt-1.5 min-h-24 font-[inherit]`} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} aria-describedby={`rp-${ticket.id}-h`} />
          <p id={`rp-${ticket.id}-h`} className="mt-1 text-xs text-[var(--lfp-mist)]">{tk.replyHint}</p>
        </div>
      )}

      {note && <p role="status" className="mt-3 text-sm text-[var(--lfp-cobalt-deep)]">{note}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {s === "pending" && (
          <>
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => patch({ status: "accepted" })}>{tk.actions.accept}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => patch({ status: "rejected" })}>{tk.actions.reject}</button>
          </>
        )}
        {s === "accepted" && (
          <>
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => patch({ status: "applied" })}>{tk.actions.apply}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => patch({ status: "rejected" })}>{tk.actions.reject}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => patch({ status: "pending" })}>{tk.actions.reopen}</button>
          </>
        )}
        {s === "rejected" && (
          <button type="button" className={btnGhost} disabled={busy} onClick={() => patch({ status: "pending" })}>{tk.actions.reopen}</button>
        )}
        {s !== "pending_email" && (
          <button type="button" className={btnGhost} disabled={busy || !reply.trim()} onClick={() => patch({ reply })}>{tk.actions.send}</button>
        )}
        <button type="button" className={`${btnDanger} ml-auto`} disabled={busy} onClick={del}>{tk.actions.delete}</button>
      </div>
    </article>
  );
}

function Tickets() {
  const { t } = useLfpLang();
  const tk = t.admin.admin.tickets;
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");

  const load = useCallback(() => {
    fetch("/api/lfp/tickets", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTickets(j.tickets ?? []))
      .catch(() => setTickets([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (tickets ?? []).filter((x) => filter === "all" || x.status === filter);
  const filters: Array<TicketStatus | "all"> = ["all", "pending", "accepted", "rejected", "applied", "pending_email"];

  return (
    <div className="space-y-5">
      <div role="group" aria-label={tk.title} className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`${btnGhost} ${filter === f ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]" : ""}`}
          >
            {f === "all" ? tk.filterAll : tk.status[f]}
            <span className="lfp-num ml-2 text-xs opacity-80">
              {(tickets ?? []).filter((x) => f === "all" || x.status === f).length}
            </span>
          </button>
        ))}
      </div>
      {tickets === null ? (
        <p className="text-sm text-[var(--lfp-mist)]">{t.admin.admin.common.loading}</p>
      ) : shown.length === 0 ? (
        <p className="lfp-sunk px-4 py-6 text-center text-sm text-[var(--lfp-cobalt-deep)]">{tk.empty}</p>
      ) : (
        <div className="space-y-4">
          {shown.map((x) => (
            <TicketCard key={x.id} ticket={x} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- dados ---------- */

function Dados() {
  const { t } = useLfpLang();
  const d = t.admin.admin.dados;
  const [id, setId] = useState<TaxId>("irs");

  return (
    <div className="space-y-5">
      <div role="group" aria-label={d.pick} className="flex flex-wrap gap-2">
        {TAX_IDS.map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={id === x}
            onClick={() => setId(x)}
            className={`${btnGhost} uppercase ${id === x ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]" : ""}`}
          >
            {x}
          </button>
        ))}
      </div>
      <JsonEditor
        url={`/api/lfp/data/${id}`}
        reloadKey={id}
        hint={d.hint}
        transform={(p) => (p as { dataset: unknown }).dataset}
        extra={(doc, setDoc) => {
          const meta = (doc as { meta?: { unverified?: boolean } }).meta ?? {};
          return (
            <div className="flex flex-wrap items-center gap-3">
              {meta.unverified && (
                <p className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-3 py-2 text-xs text-[var(--lfp-cobalt-deep)]">
                  {d.unverifiedFlag}
                </p>
              )}
              <button
                type="button"
                className={btnGhost}
                onClick={() =>
                  setDoc({
                    ...(doc as object),
                    meta: { ...meta, unverified: false, lastVerified: new Date().toISOString().slice(0, 10) },
                  })
                }
              >
                {d.markVerified}
              </button>
            </div>
          );
        }}
      />
    </div>
  );
}

/* ---------- quiz ---------- */

function Quiz() {
  const { t } = useLfpLang();
  const q = t.admin.admin.quiz;
  return (
    <JsonEditor
      url="/api/lfp/quiz"
      reloadKey="quiz"
      hint={q.hint}
      transform={(p) => {
        const j = p as { meta: unknown; questions: unknown[] };
        return { meta: j.meta, questions: j.questions };
      }}
      extra={(doc) => {
        const n = ((doc as { questions?: unknown[] }).questions ?? []).length;
        return <p className="lfp-num text-sm text-[var(--lfp-mist)]">{tr(q.count, { n })}</p>;
      }}
    />
  );
}

/* ---------- preços ---------- */

function Precos() {
  const { t } = useLfpLang();
  const p = t.admin.admin.precos;
  const c = t.admin.admin.common;
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const load = useCallback(() => {
    fetch("/api/lfp/prices", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        setMeta(j.meta ?? {});
        setState({ kind: "idle" });
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const update = (i: number, patch: Partial<PriceItem> | { label: PriceItem["label"] }) =>
    setItems((xs) => (xs ?? []).map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const add = () =>
    setItems((xs) => [
      ...(xs ?? []),
      { id: "", label: { pt: "", en: "" }, price: 0, currency: "EUR", sourceUrl: "", capturedAt: new Date().toISOString().slice(0, 10) },
    ]);

  const save = async () => {
    setState({ kind: "saving" });
    setState(await putJson("/api/lfp/prices", { meta, items }));
  };

  const cell = `${field} lfp-num text-sm`;
  const f = p.fields;

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-[var(--lfp-mist)]">{p.hint}</p>
      {items && items.length === 0 && (
        <p className="lfp-sunk px-4 py-6 text-center text-sm text-[var(--lfp-cobalt-deep)]">{p.empty}</p>
      )}
      <div className="space-y-3">
        {(items ?? []).map((it, i) => (
          <fieldset key={i} className="lfp-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <legend className="sr-only">{it.id || `#${i + 1}`}</legend>
            <div>
              <label htmlFor={`pr-id-${i}`} className="block text-xs font-medium">{f.id}</label>
              <input id={`pr-id-${i}`} className={`${cell} mt-1`} value={it.id} onChange={(e) => update(i, { id: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`pr-pt-${i}`} className="block text-xs font-medium">{f.pt}</label>
              <input id={`pr-pt-${i}`} className={`${field} mt-1 text-sm`} value={it.label.pt} onChange={(e) => update(i, { label: { ...it.label, pt: e.target.value } })} />
            </div>
            <div>
              <label htmlFor={`pr-en-${i}`} className="block text-xs font-medium">{f.en}</label>
              <input id={`pr-en-${i}`} className={`${field} mt-1 text-sm`} value={it.label.en} onChange={(e) => update(i, { label: { ...it.label, en: e.target.value } })} />
            </div>
            <div>
              <label htmlFor={`pr-price-${i}`} className="block text-xs font-medium">{f.price}</label>
              <input id={`pr-price-${i}`} type="number" inputMode="decimal" step="0.01" min="0" className={`${cell} mt-1`} value={it.price} onChange={(e) => update(i, { price: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor={`pr-url-${i}`} className="block text-xs font-medium">{f.sourceUrl}</label>
              <input id={`pr-url-${i}`} type="url" className={`${cell} mt-1`} value={it.sourceUrl} onChange={(e) => update(i, { sourceUrl: e.target.value })} />
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`pr-date-${i}`} className="block text-xs font-medium">{f.capturedAt}</label>
                <input id={`pr-date-${i}`} className={`${cell} mt-1`} value={it.capturedAt} onChange={(e) => update(i, { capturedAt: e.target.value })} placeholder="2026-01-31" />
              </div>
              <button type="button" className={btnDanger} onClick={() => setItems((xs) => (xs ?? []).filter((_, k) => k !== i))}>
                {p.remove}
              </button>
            </div>
          </fieldset>
        ))}
      </div>
      <SaveNotice state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnGhost} onClick={add}>{p.add}</button>
        <button type="button" className={btnPrimary} onClick={save} disabled={!items || state.kind === "saving"}>
          {state.kind === "saving" ? c.saving : c.save}
        </button>
        <button type="button" className={btnGhost} onClick={load}>{c.reload}</button>
      </div>
    </div>
  );
}

/* ---------- app ---------- */

export default function AdminApp() {
  const { t } = useLfpLang();
  const a = t.admin.admin;
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("estado");

  const refreshSession = useCallback(() => {
    fetch("/api/lfp/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false, configured: false, mailConfigured: false }));
  }, []);
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const logout = async () => {
    await fetch("/api/lfp/admin/logout", { method: "POST" });
    refreshSession();
  };

  return (
    <Shell crumbs={[{ label: a.crumb }]}>
      <PageIntro eyebrow={a.crumb} title={a.title} />
      {session === null ? (
        <p className="text-sm text-[var(--lfp-mist)]">{a.common.loading}</p>
      ) : !session.authenticated ? (
        <Login session={session} onDone={refreshSession} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--lfp-line)] pb-3">
            <div role="tablist" aria-label={a.title} className="flex flex-wrap gap-1">
              {TABS.map((x) => (
                <button
                  key={x}
                  role="tab"
                  type="button"
                  id={`tab-${x}`}
                  aria-selected={tab === x}
                  aria-controls={`panel-${x}`}
                  onClick={() => setTab(x)}
                  className={`lfp-focus min-h-11 rounded-lg px-4 text-sm font-medium transition-colors ${
                    tab === x ? "bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]" : "text-[var(--lfp-mist)] hover:text-[var(--lfp-cobalt)]"
                  }`}
                >
                  {a.tabs[x]}
                </button>
              ))}
            </div>
            <button type="button" className={btnGhost} onClick={logout}>{a.logout}</button>
          </div>
          <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            <h2 className="lfp-display mb-5 text-2xl font-semibold">
              {tab === "estado" ? a.estado.title : tab === "tickets" ? a.tickets.title : tab === "dados" ? a.dados.title : tab === "quiz" ? a.quiz.title : a.precos.title}
            </h2>
            {tab === "estado" && <Estado session={session} />}
            {tab === "tickets" && <Tickets />}
            {tab === "dados" && <Dados />}
            {tab === "quiz" && <Quiz />}
            {tab === "precos" && <Precos />}
          </section>
        </div>
      )}
    </Shell>
  );
}
