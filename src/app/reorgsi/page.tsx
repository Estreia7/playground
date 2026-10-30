"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { account, billingByConsultant, docProgress, growth, invoicesOf, lastFilledMonth, managerShare, sharesByMonth, ytd } from "./core/commission.ts";
import { useReorg } from "./ui/App.tsx";
import { PageHeader } from "./ui/Shell.tsx";
import { DealForm } from "./ui/forms.tsx";
import { DocBar, PartyLabel } from "./ui/parts.tsx";
import { MONTH_SHORT, money, money0, monthName, percent } from "./ui/format.ts";
import { IconPlus } from "./ui/Icons.tsx";

/* The manager's morning view: how the year is going against the target, what
   is owed to them, and which deals still need something. */

const YEAR = String(new Date().getFullYear());
const PREV = String(Number(YEAR) - 1);

export default function HomePage() {
  const { db } = useReorg();
  const [creating, setCreating] = useState(false);

  const dcNow = db.settings.dcReport[YEAR];
  const dcPrev = db.settings.dcReport[PREV];
  const upTo = lastFilledMonth(dcNow);
  const billed = ytd(dcNow, upTo);
  const billedPrev = ytd(dcPrev, upTo);
  const target = db.settings.targets[YEAR] ?? 0;
  const g = growth(billed, billedPrev);
  const monthsLeft = 11 - upTo;
  const neededPerMonth = monthsLeft > 0 ? Math.max(0, target - billed) / monthsLeft : 0;
  const acc = account(db);
  const shares = sharesByMonth(db);

  const open = db.deals.filter((d) => d.status === "aberto");
  const backlog = useMemo(() => {
    return db.deals
      .filter((d) => d.status !== "anulado")
      .map((d) => {
        const p = docProgress(d, db.docRequirements);
        const unpaid = invoicesOf(db, d.id).filter((i) => i.status === "emitida");
        return { d, p, unpaid, unpaidShare: unpaid.reduce((s, i) => s + managerShare(i, d, db.dealTypes), 0) };
      })
      .filter((x) => x.p.missing > 0 || x.p.ratio < 1 || x.unpaid.length > 0)
      .sort((a, b) => b.p.missing - a.p.missing || a.p.ratio - b.p.ratio)
      .slice(0, 8);
  }, [db]);

  const top = useMemo(() => {
    const billing = billingByConsultant(db, YEAR);
    return [...billing]
      .map(([id, v]) => ({ c: db.consultants.find((c) => c.id === id), v }))
      .filter((x) => x.c)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [db]);
  const topMax = top[0]?.v ?? 1;

  return (
    <>
      <PageHeader
        title={`Olá, ${db.settings.managerName.split(" ")[0]}`}
        sub={upTo >= 0 ? `Faturação fechada até ${monthName(`${YEAR}-${String(upTo + 1).padStart(2, "0")}`).toLowerCase()}` : "Sem faturação reportada este ano"}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setCreating(true)}>
            <IconPlus size={17} />
            Novo negócio
          </button>
        }
      />

      <div className="rs-kpis">
        <div className="rs-card rs-kpi hero">
          <span className="label">Faturação DC {YEAR}</span>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <span className="value num block">{money0(billed)}</span>
              <span className="mt-1 block text-[13px]" style={{ color: "#9fc0b9" }}>
                de {money0(target)} · faltam {money0(Math.max(0, target - billed))}
              </span>
            </div>
            <Ring ratio={target ? billed / target : 0} />
          </div>
          <MiniBars now={dcNow} prev={dcPrev} upTo={upTo} />
          {monthsLeft > 0 && target > billed && (
            <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
              Ritmo necessário: {money0(neededPerMonth)} por mês até dezembro
            </span>
          )}
        </div>
        <div className="rs-card rs-kpi">
          <span className="label">Crescimento vs {PREV}</span>
          <span className="value num">{g == null ? "—" : (g >= 0 ? "+" : "") + percent(g * 100, 1)}</span>
          <span className={`delta ${g != null && g >= 0 ? "up" : "down"}`}>
            {money0(billed)} contra {money0(billedPrev)} no mesmo período
          </span>
        </div>
        <Link href="/reorgsi/conta-corrente" className="rs-card rs-kpi" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="label">Saldo a receber</span>
          <span className="value num">{money(acc.balance)}</span>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {acc.pending > 0 ? `+ ${money(acc.pending)} em faturas por pagar` : `Ganho no ano: ${money(acc.earned)}`}
          </span>
          <ShareBars shares={shares} />
        </Link>
        <Link href="/reorgsi/negocios" className="rs-card rs-kpi" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="label">Negócios em curso</span>
          <span className="value num">{open.length}</span>
          <span className="text-[12.5px]" style={{ color: open.some((d) => docProgress(d, db.docRequirements).missing) ? "var(--amber)" : "var(--muted)" }}>
            {open.filter((d) => docProgress(d, db.docRequirements).missing > 0).length} com documentos em falta
          </span>
        </Link>
      </div>

      <section className="rs-card mb-4" aria-labelledby="dc-h">
        <div className="rs-card-head">
          <h2 id="dc-h">Faturação mensal</h2>
          <span className="aside flex items-center gap-3 text-[12.5px]">
            <Legend color="var(--teal)" label={YEAR} />
            <Legend color="var(--jade-deep)" label={PREV} />
          </span>
        </div>
        <div className="rs-card-body">
          <MonthlyChart now={dcNow} prev={dcPrev} />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rs-card" aria-labelledby="bl-h">
          <div className="rs-card-head">
            <h2 id="bl-h">Backlog</h2>
            <Link href="/reorgsi/negocios" className="rs-link aside">
              Ver negócios
            </Link>
          </div>
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Negócio</th>
                  <th>Angariação</th>
                  <th>Documentos</th>
                  <th className="right">Por receber</th>
                </tr>
              </thead>
              <tbody>
                {backlog.map(({ d, unpaid, unpaidShare }) => (
                  <tr key={d.id}>
                    <td>
                      <Link className="row-link" href={`/reorgsi/negocios/${d.id}`}>
                        {d.ref || "Sem ref."}
                      </Link>
                      <span className="rs-sub">{d.address}</span>
                    </td>
                    <td>
                      <PartyLabel db={db} party={d.angariacao} />
                    </td>
                    <td>
                      <DocBar db={db} deal={d} />
                    </td>
                    <td className="right num">
                      {unpaid.length ? (
                        <>
                          {money(unpaidShare)}
                          <span className="rs-sub">
                            {unpaid.length} fatura{unpaid.length > 1 ? "s" : ""} por pagar
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {backlog.length === 0 && <div className="rs-empty">Nada pendente. Todos os negócios têm os documentos e as faturas em dia.</div>}
          </div>
        </section>

        <section className="rs-card" aria-labelledby="top-h">
          <div className="rs-card-head">
            <h2 id="top-h">Faturação por consultor</h2>
            <span className="aside">{YEAR}, pelos negócios</span>
          </div>
          <ol className="rs-card-body m-0 flex list-none flex-col gap-3">
            {top.map(({ c, v }) => (
              <li key={c!.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-semibold">{c!.name}</span>
                  <span className="num">{money0(v)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full" style={{ background: "var(--canvas)" }}>
                  <div className="h-2 rounded-full" style={{ width: `${(v / topMax) * 100}%`, background: "var(--teal)" }} />
                </div>
              </li>
            ))}
            {top.length === 0 && <li className="rs-empty">Ainda sem faturas este ano.</li>}
          </ol>
        </section>
      </div>

      {creating && <DealForm onClose={() => setCreating(false)} />}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function Ring({ ratio }: { ratio: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${Math.round(v * 100)}% do objetivo`}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(212,236,221,0.16)" strokeWidth="7" />
      <circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke="#d4ecdd"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="38.5" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">
        {Math.round(v * 100)}%
      </text>
    </svg>
  );
}

/** Twelve thin bars in the hero card: this year solid, last year as a ghost. */
function MiniBars({ now, prev, upTo }: { now?: (number | null)[]; prev?: (number | null)[]; upTo: number }) {
  const max = Math.max(1, ...(now ?? []).map((v) => v ?? 0), ...(prev ?? []).map((v) => v ?? 0));
  return (
    <div className="mt-2 flex h-12 items-end gap-1" aria-hidden="true">
      {MONTH_SHORT.map((m, i) => (
        <div key={m} className="relative flex h-full flex-1 items-end">
          <div className="absolute bottom-0 w-full rounded-sm" style={{ height: `${((prev?.[i] ?? 0) / max) * 100}%`, background: "rgba(212,236,221,0.14)" }} />
          <div
            className="relative w-full rounded-sm"
            style={{ height: `${((now?.[i] ?? 0) / max) * 100}%`, background: i === upTo ? "#d4ecdd" : "rgba(212,236,221,0.6)" }}
          />
        </div>
      ))}
    </div>
  );
}

/** The manager's monthly earnings, as small bars under the balance. */
function ShareBars({ shares }: { shares: Map<string, number> }) {
  const series = MONTH_SHORT.map((_, i) => shares.get(`${YEAR}-${String(i + 1).padStart(2, "0")}`) ?? 0);
  const max = Math.max(1, ...series);
  return (
    <div className="mt-auto flex h-9 items-end gap-[3px] pt-2" aria-hidden="true">
      {series.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: v ? "var(--jade-deep)" : "var(--canvas)" }} />
      ))}
    </div>
  );
}

/** Grouped bars, this year against last, with values on hover and focus. */
function MonthlyChart({ now, prev }: { now?: (number | null)[]; prev?: (number | null)[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real width so labels keep their size.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 240;
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const all = [...(now ?? []), ...(prev ?? [])].map((v) => v ?? 0);
  const rawMax = Math.max(1, ...all);
  const step = rawMax > 60000 ? 25000 : 10000;
  const max = Math.ceil(rawMax / step) * step;
  const gw = (W - pad.l - pad.r) / 12;
  const bw = Math.min(22, gw * 0.3);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Faturação mensal da Direção Comercial, este ano e o anterior">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6efec" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#8aa0a4">
              {t === 0 ? "0" : `${t / 1000}k`}
            </text>
          </g>
        ))}
        {MONTH_SHORT.map((m, i) => {
          const x0 = pad.l + gw * i + gw / 2;
          const p = prev?.[i] ?? null;
          const n = now?.[i] ?? null;
          return (
            <g
              key={m}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${m}: ${n != null ? money0(n) : "sem dados"} este ano, ${p != null ? money0(p) : "sem dados"} no ano anterior`}
              style={{ outline: "none" }}
            >
              <rect x={pad.l + gw * i} y={pad.t} width={gw} height={H - pad.t - pad.b} fill={hover === i ? "#f1f7f5" : "transparent"} />
              {p != null && <rect x={x0 - bw - 1} y={y(p)} width={bw} height={y(0) - y(p)} rx="3" fill="#a9d4bb" />}
              {n != null && <rect x={x0 + 1} y={y(n)} width={bw} height={y(0) - y(n)} rx="3" fill="#345b63" />}
              <text x={x0} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b7176">
                {m}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg px-3 py-2 text-[12.5px] shadow-lg"
          style={{
            left: `clamp(0px, calc(${((pad.l + gw * hover + gw / 2) / W) * 100}% - 80px), calc(100% - 170px))`,
            background: "var(--ink)",
            color: "#fff",
            width: 170,
          }}
        >
          <div className="font-semibold capitalize">{MONTH_SHORT[hover]}</div>
          <div className="num flex justify-between">
            <span style={{ color: "#9fc0b9" }}>{YEAR}</span>
            {money0(now?.[hover] ?? undefined)}
          </div>
          <div className="num flex justify-between">
            <span style={{ color: "#9fc0b9" }}>{PREV}</span>
            {money0(prev?.[hover] ?? undefined)}
          </div>
        </div>
      )}
    </div>
  );
}
