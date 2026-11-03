"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Consultant, Db } from "../core/types.ts";
import { prizesOf } from "../core/types.ts";
import { PHASE_LABEL, STATUS_LABEL } from "../core/types.ts";
import {
  activityYears,
  allTimeBilled,
  behindTeam,
  billingYears,
  consultantStats,
  currentBacklog,
  periodCompare,
  teamStats,
  type BacklogItem,
  type ConsultantStats,
  type PeriodCompare,
} from "../core/analytics.ts";
import { invoicesOf, lastFilledMonth, ytd } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { useUrlState } from "../ui/nav.tsx";
import { DocBar, PartyLabel, PrizeChip, Rank } from "../ui/parts.tsx";
import { PersonPicker } from "../ui/PersonPicker.tsx";
import { Bars, Legend, LineCompare, cumulative, type Line } from "../ui/charts.tsx";
import { MONTH_SHORT, date, initials, money, money0, monthName, percent } from "../ui/format.ts";
import { Select } from "../ui/Select.tsx";
import { Kpi, Mix, dealSplit, monthlyVsLastYear, signed, tenure } from "../ui/stats.tsx";

/* Results and indicators: one consultant at a time, or the whole team as the
   manager sees it. Both views share the year and the backlog chart. */

type View = "consultores" | "manager";

type RankBy = "billed" | "deals" | "plenos" | "partilhas" | "share" | "backlog" | "growth";
const RANK_BY: [RankBy, string][] = [
  ["billed", "Faturação"],
  ["deals", "Negócios"],
  ["plenos", "Plenos"],
  ["partilhas", "Partilhas"],
  ["share", "Saldo manager"],
  ["backlog", "Por faturar"],
  ["growth", "Crescimento"],
];

export default function AnalysesPage() {
  const { db } = useReorg();
  const years = useMemo(() => activityYears(db), [db]);
  // ?vista=manager, ?consultor=<id>, ?ano=<year>: each consultant or view
  // opened is a step the back button returns through.
  const [year, setYear] = useUrlState<string>("ano", years[0] ?? "");
  const [view, setView] = useUrlState<View>("vista", "consultores", "push");
  const [personId, setPersonId] = useUrlState<string>("consultor", "", "push");

  const team = useMemo(() => teamStats(db, year), [db, year]);
  const chosen = personId || team.people[0]?.consultant.id || "";

  const open = (id: string) => {
    setView("consultores");
    setPersonId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <PageHeader
        title="Análises"
        sub={view === "manager" ? `Indicadores da equipa de ${db.settings.managerName}` : "Resultados e indicadores por consultor"}
        actions={
          <Select style={{ width: 110 }} value={year} onChange={setYear} ariaLabel="Ano" options={years.map((y) => ({ value: y, label: y }))} />
        }
      />

      <div className="rs-seg mb-4" role="tablist" aria-label="Vista">
        <button type="button" role="tab" aria-selected={view === "consultores"} aria-pressed={view === "consultores"} onClick={() => setView("consultores")}>
          Consultores
        </button>
        <button type="button" role="tab" aria-selected={view === "manager"} aria-pressed={view === "manager"} onClick={() => setView("manager")}>
          Manager
        </button>
      </div>

      {view === "consultores" ? (
        <ConsultantView year={year} consultantId={chosen} onPick={setPersonId} />
      ) : (
        <ManagerView year={year} team={team} onOpen={open} />
      )}
    </>
  );
}

/* ---------- Consultores ---------- */

function ConsultantView({ year, consultantId, onPick }: { year: string; consultantId: string; onPick: (id: string) => void }) {
  const { db } = useReorg();
  const consultant = db.consultants.find((c) => c.id === consultantId);
  const stats = useMemo(() => (consultant ? consultantStats(db, consultant, year) : null), [db, consultant, year]);
  const evolution = useMemo(() => (consultant ? consultantEvolution(db, consultant, year) : null), [db, consultant, year]);
  const monthly = useMemo(() => (consultant ? monthlyVsLastYear(db, consultant, year) : null), [db, consultant, year]);
  const backlog = useMemo(() => (consultant ? currentBacklog(db, consultant.id) : []), [db, consultant]);

  const groups: [string, Consultant[]][] = [
    ["Experientes", db.consultants.filter((c) => c.status === "experiente")],
    ["Rookies", db.consultants.filter((c) => c.status === "rookie")],
    ["Inativos", db.consultants.filter((c) => c.status === "inativo")],
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="rs-card flex flex-wrap items-center gap-4 p-4">
        <label className="rs-field" style={{ minWidth: 240 }}>
          Consultor
          <PersonPicker
            value={consultantId}
            onChange={onPick}
            ariaLabel="Consultor"
            options={groups.flatMap(([group, list]) => list.map((c) => ({ value: c.id, label: c.name, group })))}
          />
        </label>
        {consultant && (
          <div key={consultant.id} className="rs-profile flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-bold"
              style={{ background: "var(--jade)", color: "var(--ink)" }}
              aria-hidden="true"
            >
              {initials(consultant.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{consultant.name}</span>
                <span className={`rs-pill ${consultant.status === "experiente" ? "jade" : consultant.status === "rookie" ? "teal" : ""}`}>
                  {STATUS_LABEL[consultant.status]}
                </span>
                {prizesOf(consultant).map((p) => (
                  <PrizeChip key={p.name + p.year} prize={p} />
                ))}
              </div>
              <div className="text-[13px]" style={{ color: "var(--muted)" }}>
                {consultant.joinedAt ? `Na equipa desde ${date(consultant.joinedAt)} · ${tenure(consultant.joinedAt)}` : "Data de entrada por preencher"}
              </div>
            </div>
          </div>
        )}
      </section>

      {stats && consultant && (
        <div key={consultant.id} className="rs-swap flex flex-col gap-4">
          <div className="rs-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 0 }}>
            <Kpi label={`Faturação ${year}`} value={money0(stats.billed)} count={stats.billed} format={money0} hero>
              <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
                {stats.previous ? `${money0(stats.previous)} em ${Number(year) - 1}` : `Sem faturação em ${Number(year) - 1}`}
              </span>
            </Kpi>
            <Kpi label="Crescimento" value={stats.growth == null ? "—" : signed(stats.growth)} tone={stats.growth == null ? undefined : stats.growth >= 0 ? "up" : "down"}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                face a {Number(year) - 1}
              </span>
            </Kpi>
            <Kpi label="Negócios" value={String(stats.deals.length)} count={stats.deals.length} format={(n) => String(Math.round(n))}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {dealSplit(stats)}
              </span>
            </Kpi>
            <Kpi label="Gerado para o manager" value={money(stats.managerShare)} count={stats.managerShare} format={money}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                Faturas pagas em {year}
              </span>
            </Kpi>
            <Kpi label="Por faturar" value={money0(backlog.reduce((s, b) => s + b.remaining, 0))} count={backlog.reduce((s, b) => s + b.remaining, 0)} format={money0}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {backlog.length} negócio{backlog.length === 1 ? "" : "s"} por fechar
              </span>
            </Kpi>
          </div>

          {evolution && <EvolutionCard title="Backlog · evolução da faturação" {...evolution} />}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            <PendingCard items={backlog} />
            <section className="rs-card" aria-labelledby="cm-h">
              <div className="rs-card-head">
                <h2 id="cm-h">Faturação mensal</h2>
                <span className="aside">{monthly && <Legend items={monthly.legend} />}</span>
              </div>
              <div className="rs-card-body">
                <Bars
                  labels={MONTH_SHORT}
                  series={monthly?.series ?? []}
                  ariaLabel={`Faturação mensal de ${consultant.name} em ${year}, com ${Number(year) - 1} ao lado`}
                />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
            <section className="rs-card" aria-labelledby="mix-h">
              <div className="rs-card-head">
                <h2 id="mix-h">Tipo de negócio</h2>
              </div>
              <div className="rs-card-body">
                <Mix
                  parts={[
                    { label: "Plenos (as duas partes)", value: stats.fullDeals, color: "#345b63" },
                    { label: "Partilhas com outra agência", value: stats.sharedExternal, color: "#7fb59a" },
                    { label: "Partilhas com colega da equipa", value: stats.sharedTeam, color: "#a9d4bb" },
                    { label: "Processo bancário", value: stats.bank, color: "#c3d6d0" },
                  ]}
                />
              </div>
            </section>
            <section className="rs-card" aria-labelledby="val-h">
              <div className="rs-card-head">
                <h2 id="val-h">Valores médios</h2>
              </div>
              <dl className="rs-card-body m-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
                <dt style={{ color: "var(--muted)" }}>Preço médio de venda</dt>
                <dd className="num m-0 text-right font-semibold">{money0(stats.averagePrice)}</dd>
                <dt style={{ color: "var(--muted)" }}>Fatura média</dt>
                <dd className="num m-0 text-right font-semibold">{money0(stats.averageInvoice)}</dd>
                <dt style={{ color: "var(--muted)" }}>Faturas no ano</dt>
                <dd className="num m-0 text-right font-semibold">{stats.invoices}</dd>
                <dt style={{ color: "var(--muted)" }}>Por receber</dt>
                <dd className="num m-0 text-right font-semibold" style={{ color: stats.unpaid ? "var(--amber)" : undefined }}>
                  {stats.unpaid ? `${money0(stats.unpaidValue)} (${stats.unpaid})` : "—"}
                </dd>
              </dl>
            </section>
            <section className="rs-card" aria-labelledby="doc-h">
              <div className="rs-card-head">
                <h2 id="doc-h">Documentação</h2>
              </div>
              <dl className="rs-card-body m-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
                <dt style={{ color: "var(--muted)" }}>Negócios com documentos completos</dt>
                <dd className="num m-0 text-right font-semibold">
                  {stats.docsComplete} de {stats.deals.length}
                </dd>
                <dt style={{ color: "var(--muted)" }}>Documentos em falta</dt>
                <dd className="num m-0 text-right font-semibold" style={{ color: stats.docsMissing ? "var(--amber)" : undefined }}>
                  {stats.docsMissing}
                </dd>
                <dt style={{ color: "var(--muted)" }}>Ok mas sem ficheiro</dt>
                <dd className="num m-0 text-right font-semibold">{stats.unfiled}</dd>
              </dl>
            </section>
          </div>

          <section className="rs-card" aria-labelledby="cd-h">
            <div className="rs-card-head">
              <h2 id="cd-h">Negócios de {year}</h2>
              <Link className="rs-link aside" href={`/reorgsi/negocios?mes=&consultor=${consultant.id}`}>
                Abrir em Negócios
              </Link>
            </div>
            <div className="rs-table-wrap">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Negócio</th>
                    <th>Papel</th>
                    <th>Fase</th>
                    <th>Outro lado</th>
                    <th className="right">Preço</th>
                    <th>Documentos</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.deals.map((d) => {
                    const listing = d.angariacao.kind === "team" && d.angariacao.consultantId === consultant.id;
                    const buyer = d.compradores?.kind === "team" && d.compradores.consultantId === consultant.id;
                    const last = invoicesOf(db, d.id).at(-1);
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link className="row-link" href={`/reorgsi/negocios/${d.id}`}>
                            {d.ref || (d.transaction === "credito" ? "Crédito" : "Sem ref.")}
                          </Link>
                          <span className="rs-sub">{d.address}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          {d.transaction === "credito" ? "Processo bancário" : listing && buyer ? "Pleno" : listing ? "Partilha · angariação" : "Partilha · compradores"}
                        </td>
                        <td className="whitespace-nowrap">{last ? PHASE_LABEL[last.phase] : "—"}</td>
                        <td>
                          <PartyLabel db={db} party={listing && !buyer ? d.compradores : !listing ? d.angariacao : undefined} />
                        </td>
                        <td className="right num">{money0(d.price)}</td>
                        <td>
                          <DocBar db={db} deal={d} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {stats.deals.length === 0 && <div className="rs-empty">Sem negócios em {year}.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------- Manager ---------- */

function ManagerView({ year, team, onOpen }: { year: string; team: ReturnType<typeof teamStats>; onOpen: (id: string) => void }) {
  const { db } = useReorg();
  const backlog = useMemo(() => currentBacklog(db), [db]);
  const dc = db.settings.dcReport[year];
  const upTo = lastFilledMonth(dc);
  const dcYtd = ytd(dc, upTo);
  const target = db.settings.targets[year] ?? 0;
  const active = team.people.filter((p) => p.consultant.status !== "inativo").length;
  const unassigned = Math.max(0, team.managerShare - team.people.reduce((s, p) => s + p.managerShare, 0));
  // The ranking has its own period: all time by default, or one year.
  const [period, setPeriod] = useState("");
  const periods = useMemo(() => billingYears(db), [db]);
  const firstInvoiceYear = useMemo(() => db.invoices.map((i) => i.settlementMonth.slice(0, 4)).sort()[0], [db.invoices]);
  const invoiceYears = useMemo(() => new Set(db.invoices.map((i) => i.settlementMonth.slice(0, 4))), [db.invoices]);
  const sheetOnly = Boolean(period) && !invoiceYears.has(period);
  const rankTeam = useMemo(() => {
    if (period && invoiceYears.has(period)) return teamStats(db, period);
    if (period) {
      // A year before the app has invoices: only the spreadsheet billing exists.
      const prev = String(Number(period) - 1);
      const people = db.consultants
        .filter((c) => c.billingByYear[period])
        .map((c) => {
          const billed = c.billingByYear[period] ?? 0;
          const previous = c.billingByYear[prev] ?? 0;
          return { ...consultantStats(db, c, period), billed, previous, growth: previous ? billed / previous - 1 : null };
        });
      return { ...teamStats(db, period), people, billed: people.reduce((s, x) => s + x.billed, 0) };
    }
    // All time: deals and counts from every invoice the app has; billing per
    // year from invoices, or the spreadsheet figure for years before them.
    const all = teamStats(db, "");
    const people = all.people.map((p) => ({ ...p, billed: allTimeBilled(db, p.consultant), growth: null }));
    return { ...all, people, billed: people.reduce((s, p) => s + p.billed, 0) };
  }, [db, period, invoiceYears]);

  const backlogByPerson = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of rankTeam.people) {
      const v = currentBacklog(db, p.consultant.id).reduce((s, b) => s + b.remaining, 0);
      if (v > 0) out.set(p.consultant.id, v);
    }
    return out;
  }, [db, rankTeam.people]);
  const [sortChoice, setSort] = useState<RankBy>("billed");
  // Growth needs a year to compare with; over all time it falls back to billing.
  const sort: RankBy = !period && sortChoice === "growth" ? "billed" : sortChoice;

  const valueOf = (s: ConsultantStats, by: RankBy): number =>
    by === "billed"
      ? s.billed
      : by === "share"
        ? s.managerShare
        : by === "growth"
          ? (s.growth ?? -Infinity)
          : by === "deals"
            ? s.deals.length
            : by === "plenos"
              ? s.fullDeals
              : by === "partilhas"
                ? s.sharedExternal + s.sharedTeam
                : (backlogByPerson.get(s.consultant.id) ?? 0);
  const sortValue = (s: ConsultantStats) => valueOf(s, sort);
  // Growth can be negative and still rank; only people with no figure at all get no position.
  const ranked = (s: ConsultantStats) => (sort === "growth" ? s.growth != null : sortValue(s) > 0);
  // Ties (two people with 3 plenos) are settled by billing.
  const rows = [...rankTeam.people].sort((a, b) => sortValue(b) - sortValue(a) || b.billed - a.billed);

  const SortHead = ({ k, children }: { k: typeof sort; children: React.ReactNode }) => (
    <th className="right" aria-sort={sort === k ? "descending" : "none"}>
      <button
        type="button"
        onClick={() => setSort(k)}
        style={{ background: "none", border: 0, padding: 0, font: "inherit", color: sort === k ? "var(--ink)" : "inherit", cursor: "pointer" }}
      >
        {children}
        {sort === k ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rs-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 0 }}>
        <Kpi label={`Report DC ${year}`} value={money0(dcYtd)} hero>
          <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
            {target ? `${percent((dcYtd / target) * 100, 0)} do objetivo de ${money0(target)}` : "Sem objetivo definido"}
          </span>
        </Kpi>
        <Kpi label="Faturação pelos negócios" value={money0(team.billed)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {team.deals} negócios · {team.growth == null ? "sem ano anterior" : `${signed(team.growth)} face a ${Number(year) - 1}`}
          </span>
        </Kpi>
        <Kpi label="Saldo do manager" value={money(team.managerShare)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Faturas pagas em {year}
          </span>
        </Kpi>
        <Kpi label="Por faturar" value={money0(backlog.reduce((s, b) => s + b.remaining, 0))}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {money(backlog.reduce((s, b) => s + b.managerPart, 0))} para o manager
          </span>
        </Kpi>
        <Kpi label="Consultores ativos" value={String(active)}>
          <span className="text-[12.5px]" style={{ color: team.idle.length ? "var(--amber)" : "var(--muted)" }}>
            {team.idle.length} sem faturação em {year}
          </span>
        </Kpi>
      </div>

      <EvolutionCard title="Backlog · evolução da faturação da equipa" {...teamEvolution(db, year)} />

      <PeriodsCard year={year} />

      <BehindCard year={year} onOpen={onOpen} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <PendingCard items={backlog} />
        <section className="rs-card" aria-labelledby="bp-h">
          <div className="rs-card-head">
            <h2 id="bp-h">Por faturar por consultor</h2>
            <span className="aside">hoje</span>
          </div>
          <ol className="rs-card-body m-0 flex list-none flex-col gap-3">
            {[...backlogByPerson]
              .sort((a, b) => b[1] - a[1])
              .map(([id, v], i, all) => {
                const c = db.consultants.find((x) => x.id === id)!;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onOpen(id)}
                      className="block w-full text-left"
                      style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <Rank n={i + 1} />
                          <span className="truncate font-semibold">{c.name}</span>
                        </span>
                        <span className="num">{money0(v)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full" style={{ background: "var(--canvas)" }}>
                        <div className="h-2 rounded-full" style={{ width: `${(v / all[0][1]) * 100}%`, background: "var(--teal)" }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            {backlogByPerson.size === 0 && <li className="rs-empty">Sem backlog neste momento.</li>}
          </ol>
        </section>
      </div>

      <section className="rs-card" aria-labelledby="mm-h">
        <div className="rs-card-head">
          <h2 id="mm-h">Faturação e saldo do manager por mês</h2>
          <span className="aside">
            <Legend
              items={[
                { color: "#345b63", label: "Faturação pelos negócios" },
                { color: "#a9d4bb", label: "Report DC" },
              ]}
            />
          </span>
        </div>
        <div className="rs-card-body">
          <Bars
            labels={MONTH_SHORT}
            series={[
              { name: "Negócios", color: "#345b63", values: team.billedByMonth },
              { name: "Report DC", color: "#a9d4bb", values: dc ?? [] },
            ]}
            detail={(i) => (
              <div className="mt-1 flex justify-between gap-3 border-t pt-1" style={{ borderColor: "rgba(255,255,255,.15)" }}>
                <span style={{ color: "#9fc0b9" }}>Saldo manager</span>
                <span>{money(team.shareByMonth[i])}</span>
              </div>
            )}
            ariaLabel={`Faturação mensal da equipa em ${year}`}
          />
        </div>
      </section>

      <section className="rs-card" aria-labelledby="rk-h">
        <div className="rs-card-head">
          <h2 id="rk-h">Ranking por consultor</h2>
          <span className="aside">Clique num nome para ver o detalhe</span>
        </div>
        <div className="rs-rankby">
          <Select
            compact
            className="period"
            value={period}
            onChange={setPeriod}
            ariaLabel="Período do ranking"
            options={[{ value: "", label: "Sempre" }, ...periods.map((y) => ({ value: y, label: y }))]}
          />
          <span className="lbl" id="rk-by">Ranking por</span>
          <div className="rs-seg" role="group" aria-labelledby="rk-by">
            {RANK_BY.filter(([k]) => period || k !== "growth").map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
          {sheetOnly && (
            <span className="note">
              {period} é anterior às faturas na app: faturação e crescimento pela folha da equipa, sem negócios.
            </span>
          )}
          {!period && firstInvoiceYear && (
            <span className="note">
              Faturação antes de {firstInvoiceYear} pela folha da equipa; negócios, plenos e partilhas desde {firstInvoiceYear}.
            </span>
          )}
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Posição</th>
                <th>Consultor</th>
                <th>Estado</th>
                <SortHead k="billed">{period ? `Faturação ${period}` : "Faturação total"}</SortHead>
                <th className="right">% da equipa</th>
                <SortHead k="growth">Crescimento</SortHead>
                <SortHead k="deals">Negócios</SortHead>
                <SortHead k="plenos">Plenos</SortHead>
                <SortHead k="partilhas">Partilhas</SortHead>
                <SortHead k="share">Saldo manager</SortHead>
                <SortHead k="backlog">Por faturar</SortHead>
                <th className="right">Docs completos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.consultant.id}>
                  <td>{ranked(p) ? <Rank n={i + 1} /> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="row-link"
                      onClick={() => onOpen(p.consultant.id)}
                      style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", fontWeight: 600, cursor: "pointer" }}
                    >
                      {p.consultant.name}
                    </button>
                  </td>
                  <td>
                    <span className={`rs-pill ${p.consultant.status === "experiente" ? "jade" : p.consultant.status === "rookie" ? "teal" : ""}`}>
                      {STATUS_LABEL[p.consultant.status]}
                    </span>
                  </td>
                  <td className="right num font-semibold">{p.billed ? money0(p.billed) : "—"}</td>
                  <td className="right num">{rankTeam.billed && p.billed ? percent((p.billed / rankTeam.billed) * 100, 1) : "—"}</td>
                  <td className="right num" style={{ color: p.growth == null ? "var(--faint)" : p.growth >= 0 ? "#2f7a57" : "var(--amber)" }}>
                    {p.growth == null ? "—" : signed(p.growth)}
                  </td>
                  <td className="right num">
                    {p.deals.length || "—"}
                    {p.bank > 0 && <span className="rs-sub">{p.bank} CB</span>}
                  </td>
                  <td className="right num">{p.deals.length ? p.fullDeals : "—"}</td>
                  <td className="right num">{p.deals.length ? p.sharedExternal + p.sharedTeam : "—"}</td>
                  <td className="right num">{p.managerShare ? money(p.managerShare) : "—"}</td>
                  <td className="right num">{backlogByPerson.get(p.consultant.id) ? money0(backlogByPerson.get(p.consultant.id)) : "—"}</td>
                  <td className="right num">{p.deals.length ? `${p.docsComplete}/${p.deals.length}` : "—"}</td>
                </tr>
              ))}
              {unassigned > 0.005 && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--muted)" }}>
                    Negócios sem consultor da equipa num dos lados
                  </td>
                  <td className="right num">{money(unassigned)}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <section className="rs-card" aria-labelledby="tp-h">
          <div className="rs-card-head">
            <h2 id="tp-h">Negócios por tipo de comissão</h2>
          </div>
          <div className="rs-card-body">
            <Mix
              parts={team.byType.map((t, i) => ({
                label: `${t.name} · ${money0(t.billed)}`,
                value: t.count,
                color: ["#345b63", "#7fb59a", "#a9d4bb", "#c3d6d0"][i % 4],
              }))}
            />
          </div>
        </section>
        <section className="rs-card" aria-labelledby="st-h">
          <div className="rs-card-head">
            <h2 id="st-h">Experientes e rookies</h2>
          </div>
          <dl className="rs-card-body m-0 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2.5 text-sm">
            {team.byStatus.map((g) => (
              <div key={g.status} className="contents">
                <dt>{STATUS_LABEL[g.status]}s</dt>
                <dd className="num m-0 text-right" style={{ color: "var(--muted)" }}>
                  {g.people} pessoas
                </dd>
                <dd className="num m-0 text-right font-semibold">{money0(g.billed)}</dd>
              </div>
            ))}
            {team.idle.length > 0 && (
              <>
                <dt className="col-span-3 mt-2 border-t pt-3 font-semibold" style={{ borderColor: "var(--line)" }}>
                  Sem faturação em {year}
                </dt>
                <dd className="col-span-3 m-0" style={{ color: "var(--muted)" }}>
                  {team.idle.map((c) => c.name).join(", ")}
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}

/* Report DC by quarter and semester against the year before. Semesters sit
   under the quarters they are made of. */
function PeriodsCard({ year }: { year: string }) {
  const { db } = useReorg();
  const prevYear = String(Number(year) - 1);
  const dc = db.settings.dcReport[year] ?? [];
  const dcPrev = db.settings.dcReport[prevYear] ?? [];
  const target = db.settings.targets[year] ?? 0;
  if (!dc.length) return null;
  const { quarters, semesters } = periodCompare(dc, dcPrev, lastFilledMonth(dc));
  return (
    <section className="rs-card" aria-labelledby="pr-h">
      <div className="rs-card-head flex-wrap">
        <h2 id="pr-h">Trimestres e semestres</h2>
        <span className="aside">
          Report DC {year} face a {prevYear}
        </span>
      </div>
      <div className="rs-card-body rs-periods">
        {quarters.map((p) => (
          <PeriodTile key={p.label} p={p} prevYear={prevYear} target={target / 4} />
        ))}
        {semesters.map((p) => (
          <PeriodTile key={p.label} p={p} prevYear={prevYear} target={target / 2} wide />
        ))}
      </div>
    </section>
  );
}

function PeriodTile({ p, prevYear, target, wide = false }: { p: PeriodCompare; prevYear: string; target: number; wide?: boolean }) {
  const range = `${MONTH_SHORT[p.months[0]]}–${MONTH_SHORT[p.months[1]]}`;
  const diff = p.prev ? p.now / p.prev - 1 : null;
  const top = Math.max(p.now, p.prev, 1);
  return (
    <div className={`rs-period ${wide ? "wide" : ""} ${p.state}`}>
      <div className="head">
        <h3>{p.label}</h3>
        <span>
          {range}
          {p.state === "running" && ` · até ${MONTH_SHORT[p.upTo]}`}
        </span>
      </div>
      {p.state === "ahead" ? (
        <>
          <span className="value" style={{ color: "var(--faint)" }}>
            Por começar
          </span>
          <span className="sub">
            {prevYear}: <span className="num">{p.prevFull ? money0(p.prevFull) : "sem dados"}</span>
          </span>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="value num">{money0(p.now)}</span>
            {diff != null && (
              <span className="delta num" style={{ color: diff >= 0 ? "#2f7a57" : "var(--amber)" }}>
                {signed(diff)}
              </span>
            )}
          </div>
          <div className="bars" aria-hidden="true">
            <span style={{ width: `${(p.now / top) * 100}%` }} />
            <span className="prev" style={{ width: `${(p.prev / top) * 100}%` }} />
          </div>
          <span className="sub">
            {prevYear}
            {p.state === "running" ? " nos mesmos meses" : ""}: <span className="num">{p.prev ? money0(p.prev) : "sem dados"}</span>
            {target > 0 && p.state === "done" && <> · {percent((p.now / target) * 100, 0)} do objetivo</>}
          </span>
        </>
      )}
    </div>
  );
}

/* The five active consultants furthest behind, so the manager knows who to
   sit down with. */
function BehindCard({ year, onOpen }: { year: string; onOpen: (id: string) => void }) {
  const { db } = useReorg();
  const [by, setBy] = useState<"billed" | "deals">("billed");
  const { items, upTo } = useMemo(() => behindTeam(db, year, by), [db, year, by]);
  const prevYear = String(Number(year) - 1);
  return (
    <section className="rs-card rs-behind" aria-labelledby="bh-h">
      <div className="rs-card-head flex-wrap">
        <div className="min-w-0">
          <h2 id="bh-h">Quem precisa de atenção</h2>
          <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: "var(--muted)" }}>
            {by === "billed"
              ? `Faturação até ${upTo >= 0 ? MONTH_SHORT[upTo] : "agora"} face ao próprio ${prevYear} nos mesmos meses, ou ao valor típico da equipa (mediana) para quem não tem ${prevYear}.`
              : "Negócios no ano face ao valor típico da equipa (mediana), ajustado ao tempo de cada um na equipa."}
          </p>
        </div>
        <div className="rs-seg" role="group" aria-label="Medir por">
          <button type="button" aria-pressed={by === "billed"} onClick={() => setBy("billed")}>
            Faturação
          </button>
          <button type="button" aria-pressed={by === "deals"} onClick={() => setBy("deals")}>
            Negócios
          </button>
        </div>
      </div>
      <ol className="rs-card-body m-0 flex list-none flex-col">
        {items.map((it) => {
          const c = it.stats.consultant;
          const ratio = it.actual / it.expected;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} aria-label={`Ver a análise de ${c.name}`}>
                <span className="who">
                  <span className="rs-behind-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="name">{c.name}</span>
                    <span className="meta">
                      {STATUS_LABEL[c.status]} · {it.lastInvoice ? `última fatura em ${monthName(it.lastInvoice).toLowerCase()}` : "sem faturas na app"}
                    </span>
                  </span>
                </span>
                <span className="gauge">
                  <span className="track" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, ratio * 100)}%` }} />
                  </span>
                  <span className="fig">
                    {by === "billed" ? (
                      <>
                        <span className="num font-semibold">{money0(it.actual)}</span>
                        <span className="num"> de {money0(it.expected)}</span>
                      </>
                    ) : (
                      <>
                        <span className="num font-semibold">
                          {it.actual} {it.actual === 1 ? "negócio" : "negócios"}
                        </span>
                        <span className="num"> · típico {it.expected.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="gap">
                  <span className="num">{by === "billed" ? `−${money0(it.expected - it.actual)}` : `−${percent((1 - ratio) * 100, 0)}`}</span>
                  <span className="why">{by === "billed" ? (it.basis === "own" ? `face a ${prevYear}` : "face à equipa") : "abaixo da equipa"}</span>
                </span>
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="rs-empty">Ninguém está atrás neste momento.</li>}
      </ol>
    </section>
  );
}

/* ---------- shared pieces ---------- */

/** Commission already won but not invoiced yet (the rest of a deal whose first part was billed). */
function PendingCard({ items }: { items: BacklogItem[] }) {
  const { db } = useReorg();
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? items : items.slice(0, 6);
  const total = items.reduce((s, b) => s + b.remaining, 0);
  return (
    <section className="rs-card" aria-labelledby="pf-h">
      <div className="rs-card-head">
        <h2 id="pf-h">Por faturar</h2>
        <span className="aside num">{money0(total)}</span>
      </div>
      <div className="rs-card-body">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--muted)" }}>
          Restante comissão de negócios com a 1.ª parte já faturada. Sem % de comissão no negócio, a restante é estimada igual à 1.ª parte.
        </p>
        {items.length === 0 && <p className="rs-empty m-0">Nada por faturar neste momento.</p>}
        <ul className="m-0 mt-2 flex list-none flex-col p-0">
          {list.map((b) => (
            <li key={b.deal.id} className="flex items-center gap-3 border-t py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              <div className="min-w-0 flex-1">
                <Link className="rs-link" href={`/reorgsi/negocios/${b.deal.id}`}>
                  {b.deal.ref || b.deal.address}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
                  <PartyLabel db={db} party={b.deal.angariacao} />
                  <span>desde {monthName(b.since).toLowerCase()}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="num font-semibold">{money0(b.remaining)}</div>
                <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                  {b.estimated ? "estimado" : "acordado"}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {items.length > 6 && (
          <button type="button" className="rs-btn ghost sm mt-1" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Mostrar menos" : `Ver os ${items.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

interface Evolution {
  lines: Line[];
  /** Index of the last month with this year's figures. */
  upTo: number;
  note: string;
}

/* The backlog chart: billing accumulated through the year against the year
   before, so it shows at a glance whether the year is ahead or behind. */
function EvolutionCard({ title, lines, upTo, note }: Evolution & { title: string }) {
  const [now, prev] = lines;
  const a = now?.values[upTo] ?? null;
  const b = prev?.values[upTo] ?? null;
  const diff = a != null && b != null ? a - b : null;
  return (
    <section className="rs-card" aria-labelledby="ev-h">
      <div className="rs-card-head flex-wrap">
        <h2 id="ev-h">{title}</h2>
        <span className="aside flex flex-wrap items-center gap-3 text-[12.5px]">
          {lines.map((l) => (
            <span key={l.name} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden="true">
                <line
                  x1="1"
                  x2="17"
                  y1="3"
                  y2="3"
                  stroke={l.color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeDasharray={l.dashed ? "5 3" : l.dotted ? "1.5 3.5" : undefined}
                />
              </svg>
              {l.name}
            </span>
          ))}
        </span>
      </div>
      <div className="rs-card-body">
        {diff != null && upTo >= 0 && (
          <p className="m-0 mb-2 text-sm">
            <span className="font-bold" style={{ color: diff >= 0 ? "#2f7a57" : "var(--amber)" }}>
              {diff >= 0 ? "+" : "−"}
              {money0(Math.abs(diff))}
              {b ? ` (${diff >= 0 ? "+" : "−"}${percent(Math.abs(diff / b) * 100, 1)})` : ""}
            </span>{" "}
            <span style={{ color: "var(--muted)" }}>
              face a {prev.name.split(" ")[0]} até {MONTH_SHORT[upTo]}: {diff >= 0 ? "estamos à frente" : "estamos atrás"}
            </span>
          </p>
        )}
        <LineCompare labels={MONTH_SHORT} lines={lines} ariaLabel={`${title}: faturação acumulada por mês`} />
        <p className="m-0 mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      </div>
    </section>
  );
}

const NOW_LINE = { color: "#345b63", area: "rgba(212,236,221,0.55)", points: true };
const PREV_LINE = { color: "#7f9fb0", dashed: true };

/** Team: the Report DC figures, accumulated, against last year and the target pace. */
function teamEvolution(db: Db, year: string): Evolution {
  const prevYear = String(Number(year) - 1);
  const dc = db.settings.dcReport[year] ?? [];
  const dcPrev = db.settings.dcReport[prevYear] ?? [];
  const upTo = lastFilledMonth(dc);
  const target = db.settings.targets[year];
  const lines: Line[] = [
    { name: year, values: cumulative(dc, upTo), ...NOW_LINE },
    { name: prevYear, values: cumulative(dcPrev, lastFilledMonth(dcPrev)), ...PREV_LINE },
  ];
  if (target) {
    lines.push({ name: "Objetivo", values: MONTH_SHORT.map((_, i) => (target * (i + 1)) / 12), color: "#c9a35c", dotted: true });
  }
  return { lines, upTo, note: "Faturação Report DC acumulada mês a mês. A linha do objetivo é o ritmo constante até ao objetivo anual." };
}

/** One consultant: billing from the deals, accumulated, against last year. Last
 *  year comes from the deals when there are any, otherwise from the team
 *  sheet's annual figure spread evenly (its pace). */
function consultantEvolution(db: Db, consultant: Consultant, year: string): Evolution {
  const prevYear = String(Number(year) - 1);
  const now = new Date();
  const upTo = year === String(now.getFullYear()) ? now.getMonth() : 11;
  const stats = consultantStats(db, consultant, year);
  const prev = consultantStats(db, consultant, prevYear);
  const annual = consultant.billingByYear[prevYear] ?? 0;
  const lines: Line[] = [{ name: year, values: cumulative(stats.billedByMonth, upTo), ...NOW_LINE }];
  let note = "Faturação pelos negócios, acumulada mês a mês.";
  if (prev.billed > 0) {
    lines.push({ name: prevYear, values: cumulative(prev.billedByMonth), ...PREV_LINE });
  } else if (annual > 0) {
    lines.push({ name: `${prevYear} (ritmo)`, values: MONTH_SHORT.map((_, i) => (annual * (i + 1)) / 12), ...PREV_LINE });
    note += ` ${prevYear} só tem o total anual (${money0(annual)}), por isso aparece como ritmo constante.`;
  } else {
    note += ` Sem faturação em ${prevYear} para comparar.`;
  }
  return { lines, upTo, note };
}
