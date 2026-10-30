"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Consultant } from "../core/types.ts";
import { PHASE_LABEL, STATUS_LABEL } from "../core/types.ts";
import {
  activityYears,
  backlogSeries,
  consultantStats,
  currentBacklog,
  teamStats,
  type BacklogItem,
  type BacklogPoint,
  type ConsultantStats,
} from "../core/analytics.ts";
import { invoicesOf, lastFilledMonth, ytd } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { DocBar, PartyLabel, Rank } from "../ui/parts.tsx";
import { Bars, Legend } from "../ui/charts.tsx";
import { MONTH_SHORT, date, initials, money, money0, monthName, percent } from "../ui/format.ts";

/* Results and indicators: one consultant at a time, or the whole team as the
   manager sees it. Both views share the year and the backlog chart. */

type View = "consultores" | "manager";

export default function AnalysesPage() {
  const { db } = useReorg();
  const years = useMemo(() => activityYears(db), [db]);
  const [year, setYear] = useState(years[0]);
  const [view, setView] = useState<View>("consultores");
  const [personId, setPersonId] = useState<string>("");

  // Deep links: ?vista=manager, ?consultor=<id>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("vista") === "manager") setView("manager");
    const c = q.get("consultor");
    if (c) {
      setPersonId(c);
      setView("consultores");
    }
  }, []);

  const team = useMemo(() => teamStats(db, year), [db, year]);
  const chosen = personId || team.people[0]?.consultant.id || "";

  const open = (id: string) => {
    setPersonId(id);
    setView("consultores");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <PageHeader
        title="Análises"
        sub={view === "manager" ? `Indicadores da equipa de ${db.settings.managerName}` : "Resultados e indicadores por consultor"}
        actions={
          <select className="rs-select" style={{ width: "auto" }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Ano">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
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
  const series = useMemo(() => (consultant ? backlogSeries(db, year, consultant.id) : []), [db, consultant, year]);
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
          <select className="rs-select" value={consultantId} onChange={(e) => onPick(e.target.value)}>
            {groups.map(([label, list]) =>
              list.length ? (
                <optgroup key={label} label={label}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </label>
        {consultant && (
          <div className="flex min-w-0 items-center gap-3">
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
                {consultant.prize && <span className="rs-pill ink">{consultant.prize}</span>}
              </div>
              <div className="text-[13px]" style={{ color: "var(--muted)" }}>
                {consultant.joinedAt ? `Na equipa desde ${date(consultant.joinedAt)} · ${tenure(consultant.joinedAt)}` : "Data de entrada por preencher"}
              </div>
            </div>
          </div>
        )}
      </section>

      {stats && consultant && (
        <>
          <div className="rs-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 0 }}>
            <Kpi label={`Faturação ${year}`} value={money0(stats.billed)} hero>
              <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
                {stats.previous ? `${money0(stats.previous)} em ${Number(year) - 1}` : `Sem faturação em ${Number(year) - 1}`}
              </span>
            </Kpi>
            <Kpi label="Crescimento" value={stats.growth == null ? "—" : signed(stats.growth)} tone={stats.growth == null ? undefined : stats.growth >= 0 ? "up" : "down"}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                face a {Number(year) - 1}
              </span>
            </Kpi>
            <Kpi label="Negócios" value={String(stats.deals.length)}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {stats.asListing} angariação · {stats.asBuyer} compradores
              </span>
            </Kpi>
            <Kpi label="Gerado para o manager" value={money(stats.managerShare)}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                Faturas pagas em {year}
              </span>
            </Kpi>
            <Kpi label="Backlog" value={money0(backlog.reduce((s, b) => s + b.remaining, 0))}>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {backlog.length} negócio{backlog.length === 1 ? "" : "s"} por fechar
              </span>
            </Kpi>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            <BacklogCard title="Backlog" series={series} items={backlog} />
            <section className="rs-card" aria-labelledby="cm-h">
              <div className="rs-card-head">
                <h2 id="cm-h">Faturação mensal</h2>
                <span className="aside">{year}</span>
              </div>
              <div className="rs-card-body">
                <Bars
                  labels={MONTH_SHORT}
                  series={[{ name: "Faturado", color: "#345b63", values: stats.billedByMonth }]}
                  ariaLabel={`Faturação mensal de ${consultant.name} em ${year}`}
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
                    { label: "Os dois lados", value: stats.fullDeals, color: "#345b63" },
                    { label: "Com outra agência", value: stats.sharedExternal, color: "#7fb59a" },
                    { label: "Com colega da equipa", value: stats.sharedTeam, color: "#a9d4bb" },
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
              <Link className="rs-link aside" href={`/reorgsi/negocios?consultor=${consultant.id}`}>
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
                          {d.transaction === "credito" ? "Processo" : listing && buyer ? "Os dois lados" : listing ? "Angariação" : "Compradores"}
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
        </>
      )}
    </div>
  );
}

/* ---------- Manager ---------- */

function ManagerView({ year, team, onOpen }: { year: string; team: ReturnType<typeof teamStats>; onOpen: (id: string) => void }) {
  const { db } = useReorg();
  const series = useMemo(() => backlogSeries(db, year), [db, year]);
  const backlog = useMemo(() => currentBacklog(db), [db]);
  const dc = db.settings.dcReport[year];
  const upTo = lastFilledMonth(dc);
  const dcYtd = ytd(dc, upTo);
  const target = db.settings.targets[year] ?? 0;
  const active = team.people.filter((p) => p.consultant.status !== "inativo").length;
  const unassigned = Math.max(0, team.managerShare - team.people.reduce((s, p) => s + p.managerShare, 0));
  const backlogByPerson = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of team.people) {
      const v = currentBacklog(db, p.consultant.id).reduce((s, b) => s + b.remaining, 0);
      if (v > 0) out.set(p.consultant.id, v);
    }
    return out;
  }, [db, team.people]);
  const [sort, setSort] = useState<"billed" | "share" | "growth" | "deals" | "backlog">("billed");

  const sortValue = (s: ConsultantStats) =>
    sort === "billed" ? s.billed : sort === "share" ? s.managerShare : sort === "growth" ? (s.growth ?? -Infinity) : sort === "deals" ? s.deals.length : (backlogByPerson.get(s.consultant.id) ?? 0);
  // Growth can be negative and still rank; only people with no figure at all get no position.
  const ranked = (s: ConsultantStats) => (sort === "growth" ? s.growth != null : sortValue(s) > 0);
  const rows = [...team.people].sort((a, b) => sortValue(b) - sortValue(a));

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
        <Kpi label="Backlog" value={money0(backlog.reduce((s, b) => s + b.remaining, 0))}>
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <BacklogCard title="Backlog da equipa" series={series} items={backlog} />
        <section className="rs-card" aria-labelledby="bp-h">
          <div className="rs-card-head">
            <h2 id="bp-h">Backlog por consultor</h2>
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
          <h2 id="rk-h">Indicadores por consultor</h2>
          <span className="aside">Clique num nome para ver o detalhe</span>
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Posição</th>
                <th>Consultor</th>
                <th>Estado</th>
                <SortHead k="billed">Faturação {year}</SortHead>
                <th className="right">% da equipa</th>
                <SortHead k="growth">Crescimento</SortHead>
                <SortHead k="deals">Negócios</SortHead>
                <th className="right">Ang. / Comp.</th>
                <SortHead k="share">Saldo manager</SortHead>
                <SortHead k="backlog">Backlog</SortHead>
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
                  <td className="right num">{team.billed && p.billed ? percent((p.billed / team.billed) * 100, 1) : "—"}</td>
                  <td className="right num" style={{ color: p.growth == null ? "var(--faint)" : p.growth >= 0 ? "#2f7a57" : "var(--amber)" }}>
                    {p.growth == null ? "—" : signed(p.growth)}
                  </td>
                  <td className="right num">{p.deals.length || "—"}</td>
                  <td className="right num">
                    {p.asListing} / {p.asBuyer}
                  </td>
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

/* ---------- shared pieces ---------- */

function BacklogCard({ title, series, items }: { title: string; series: BacklogPoint[]; items: BacklogItem[] }) {
  const { db } = useReorg();
  const [showAll, setShowAll] = useState(false);
  const firm = series.map((p) => p.value - p.estimated);
  const est = series.map((p) => p.estimated);
  const anyFirm = firm.some((v) => v > 0);
  const list = showAll ? items : items.slice(0, 5);
  const headId = "bl-" + title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section className="rs-card" aria-labelledby={headId}>
      <div className="rs-card-head">
        <h2 id={headId}>{title}</h2>
        <span className="aside">
          <Legend
            items={[
              ...(anyFirm ? [{ color: "#345b63", label: "Pela comissão acordada" }] : []),
              { color: "#345b63", label: "Estimado (restante = 1.ª parte)", hatched: true },
            ]}
          />
        </span>
      </div>
      <div className="rs-card-body">
        <Bars
          labels={series.map((p) => MONTH_SHORT[Number(p.month.slice(5, 7)) - 1])}
          stacked
          series={[
            { name: "Acordado", color: "#345b63", values: firm },
            { name: "Estimado", color: "#345b63", values: est, hatched: true },
          ]}
          detail={(i) => (
            <>
              <div className="mt-1 flex justify-between gap-3 border-t pt-1" style={{ borderColor: "rgba(255,255,255,.15)" }}>
                <span style={{ color: "#9fc0b9" }}>Manager</span>
                <span>{money(series[i].managerPart)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span style={{ color: "#9fc0b9" }}>Negócios</span>
                <span>{series[i].deals}</span>
              </div>
            </>
          )}
          ariaLabel={`${title}: valor por faturar no fim de cada mês`}
        />
        <p className="m-0 mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
          Comissão já ganha e ainda por faturar, no fim de cada mês.
        </p>
        {items.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col p-0">
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
        )}
        {items.length > 5 && (
          <button type="button" className="rs-btn ghost sm mt-1" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Mostrar menos" : `Ver os ${items.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  hero = false,
  tone,
  children,
}: {
  label: string;
  value: string;
  hero?: boolean;
  tone?: "up" | "down";
  children?: React.ReactNode;
}) {
  return (
    <div className={`rs-card rs-kpi ${hero ? "hero" : ""}`}>
      <span className="label">{label}</span>
      <span className="value num" style={tone ? { color: tone === "up" ? "#2f7a57" : "var(--amber)" } : undefined}>
        {value}
      </span>
      {children}
    </div>
  );
}

/** One horizontal bar split by parts, with a legend of counts underneath. */
function Mix({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="rs-empty m-0">Sem negócios.</p>;
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {parts
          .filter((p) => p.value)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="num font-semibold">{p.value}</span>
            <span className="num w-12 text-right" style={{ color: "var(--muted)" }}>
              {percent((p.value / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function signed(g: number): string {
  return (g >= 0 ? "+" : "") + percent(g * 100, 1);
}

function tenure(joined: string): string {
  const months = Math.max(0, Math.round((Date.now() - new Date(joined).getTime()) / (30.44 * 86400000)));
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} ${y === 1 ? "ano" : "anos"}${m ? ` e ${m} ${m === 1 ? "mês" : "meses"}` : ""}`;
}
