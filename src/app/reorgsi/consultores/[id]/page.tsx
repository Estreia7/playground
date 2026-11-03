"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Consultant, Deal, Invoice, Party } from "../../core/types.ts";
import { STATUS_LABEL, prizesOf } from "../../core/types.ts";
import { dealBilled, docProgress, managerShare, teamId } from "../../core/commission.ts";
import { activityYears, billingYears, consultantStats, currentBacklog, weightFor } from "../../core/analytics.ts";
import { useReorg } from "../../ui/App.tsx";
import { PageHeader } from "../../ui/Shell.tsx";
import { BackLink } from "../../ui/nav.tsx";
import { Avatar, DealStatusPill, DocRing, PartyLabel, PrizeChip } from "../../ui/parts.tsx";
import { ConsultantForm } from "../../ui/ConsultantForm.tsx";
import { Bars } from "../../ui/charts.tsx";
import { Kpi, Mix, dealSplit, signed, tenure } from "../../ui/stats.tsx";
import { preparePhoto } from "../../ui/files/prepare.ts";
import { MONTH_SHORT, date, money, money0, monthName } from "../../ui/format.ts";
import { IconCamera, IconChart, IconTrash } from "../../ui/Icons.tsx";

/* One consultant: who they are, how they are doing this year at a glance,
   who they work with, and every deal they are on. The photo is set here:
   click or drop an image on the face. */

type Role = "pleno" | "angariacao" | "compradores" | "bancario";

const ROLE_LABEL: Record<Role, string> = {
  pleno: "Pleno",
  angariacao: "Angariação",
  compradores: "Compradores",
  bancario: "Bancário",
};

export default function ConsultantPage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useReorg();
  const consultant = db.consultants.find((c) => c.id === id);

  useEffect(() => {
    if (consultant) document.title = `${consultant.name} · ReorgSI`;
  }, [consultant]);

  if (!consultant) {
    return (
      <>
        <BackLink href="/reorgsi/consultores" label="Consultores" />
        <PageHeader title="Consultor não encontrado" />
        <div className="rs-card rs-empty">
          Este consultor foi apagado ou o link está errado.{" "}
          <Link className="rs-link" href="/reorgsi/consultores">
            Ver a equipa
          </Link>
        </div>
      </>
    );
  }
  return <Profile key={consultant.id} consultant={consultant} />;
}

function Profile({ consultant: c }: { consultant: Consultant }) {
  const { db } = useReorg();
  const [editing, setEditing] = useState(false);
  const year = activityYears(db)[0] ?? String(new Date().getFullYear());
  const prev = String(Number(year) - 1);

  const stats = useMemo(() => consultantStats(db, c, year), [db, c, year]);
  const backlog = useMemo(() => currentBacklog(db, c.id), [db, c.id]);
  const links = useMemo(() => connections(db.deals, c.id), [db.deals, c.id]);

  const yearly = useMemo(() => {
    const invoiceYears = new Set(db.invoices.map((i) => i.settlementMonth.slice(0, 4)));
    const all = billingYears(db)
      .slice()
      .sort()
      .map((y) => ({ y, v: invoiceYears.has(y) ? consultantStats(db, c, y).billed : (c.billingByYear[y] ?? 0) }));
    const first = all.findIndex((r) => r.v > 0);
    return first < 0 ? [] : all.slice(first);
  }, [db, c]);
  const allTime = yearly.reduce((s, r) => s + r.v, 0);

  // Invoices on this consultant's deals still waiting to be paid.
  const unpaid = useMemo(() => {
    const deals = new Map(db.deals.map((d) => [d.id, d]));
    return db.invoices
      .filter((i) => i.status === "emitida")
      .map((i) => ({ inv: i, deal: deals.get(i.dealId) }))
      .filter((r): r is { inv: Invoice; deal: Deal } => !!r.deal && weightFor(r.deal, c.id) > 0)
      .sort((a, b) => (a.inv.issuedAt ?? "").localeCompare(b.inv.issuedAt ?? ""));
  }, [db.deals, db.invoices, c.id]);

  const open = links.deals.filter((r) => r.deal.status === "aberto").length;
  const backlogTotal = backlog.reduce((s, b) => s + b.remaining, 0);
  const docsMissing = links.deals.filter((r) => r.deal.status !== "anulado").reduce((s, r) => {
    const p = docProgress(r.deal, db.docRequirements);
    return s + (p.total - p.done);
  }, 0);
  const unpaidShare = unpaid.reduce((s, r) => s + managerShare(r.inv, r.deal, db.dealTypes), 0);

  return (
    <>
      <BackLink href="/reorgsi/consultores" label="Consultores" />

      <section className="rs-card rs-cprofile">
        <PhotoSlot consultant={c} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-2xl font-bold tracking-tight">{c.name}</h1>
            <span className={`rs-pill ${c.status === "experiente" ? "jade" : c.status === "rookie" ? "teal" : ""}`}>{STATUS_LABEL[c.status]}</span>
            {prizesOf(c).map((p) => (
              <PrizeChip key={p.name + p.year} prize={p} />
            ))}
          </div>
          <p className="m-0 mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {c.joinedAt ? `Na equipa desde ${date(c.joinedAt)} · ${tenure(c.joinedAt)}` : "Data de entrada por preencher"}
            {allTime > 0 && ` · ${money0(allTime)} faturados desde ${yearly[0].y}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rs-btn" href={`/reorgsi/analises?consultor=${c.id}`}>
            <IconChart size={17} />
            Análise completa
          </Link>
          <button type="button" className="rs-btn primary" onClick={() => setEditing(true)}>
            Editar
          </button>
        </div>
      </section>

      <div className="rs-kpis rs-cprofile-kpis">
        <Kpi label={`Faturação ${year}`} value={money0(stats.billed)} count={stats.billed} format={money0} hero>
          <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
            {stats.previous ? `${money0(stats.previous)} em ${prev}` : `Sem faturação em ${prev}`}
          </span>
        </Kpi>
        <Kpi label="Crescimento" value={stats.growth == null ? "—" : signed(stats.growth)} tone={stats.growth == null ? undefined : stats.growth >= 0 ? "up" : "down"}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            face a {prev}
          </span>
        </Kpi>
        <Kpi label={`Negócios ${year}`} value={String(stats.deals.length)} count={stats.deals.length} format={(n) => String(Math.round(n))}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {dealSplit(stats)}
          </span>
        </Kpi>
        <Kpi label="Em curso" value={String(open)} count={open} format={(n) => String(Math.round(n))}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            de {links.deals.length} no total
          </span>
        </Kpi>
        <Kpi label="Por faturar" value={money0(backlogTotal)} count={backlogTotal} format={money0}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {backlog.length} negócio{backlog.length === 1 ? "" : "s"} por fechar
          </span>
        </Kpi>
        <Kpi label="Gerado para o manager" value={money(stats.managerShare)} count={stats.managerShare} format={money}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Faturas pagas em {year}
          </span>
        </Kpi>
        <Kpi label="Por receber" value={money(unpaidShare)} tone={unpaid.length ? "down" : undefined}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {unpaid.length ? `${unpaid.length} fatura${unpaid.length === 1 ? "" : "s"} emitida${unpaid.length === 1 ? "" : "s"}` : "Tudo recebido"}
          </span>
        </Kpi>
        <Kpi label="Documentos em falta" value={String(docsMissing)} tone={docsMissing ? "down" : undefined}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {docsMissing ? "nos negócios ativos" : "Tudo carregado"}
          </span>
        </Kpi>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <section className="rs-card" aria-labelledby="cp-month">
          <div className="rs-card-head">
            <h2 id="cp-month">Faturação mensal</h2>
            <span className="aside">{year}</span>
          </div>
          <div className="rs-card-body">
            <Bars labels={MONTH_SHORT} series={[{ name: "Faturado", color: "#345b63", values: stats.billedByMonth }]} ariaLabel={`Faturação mensal de ${c.name} em ${year}`} />
          </div>
        </section>
        <section className="rs-card" aria-labelledby="cp-year">
          <div className="rs-card-head">
            <h2 id="cp-year">Faturação por ano</h2>
            <span className="aside">{allTime ? `${money0(allTime)} no total` : ""}</span>
          </div>
          <div className="rs-card-body">
            {yearly.length ? (
              <Bars labels={yearly.map((r) => r.y)} series={[{ name: "Faturado", color: "#7fb59a", values: yearly.map((r) => r.v) }]} ariaLabel={`Faturação anual de ${c.name}`} />
            ) : (
              <p className="rs-empty m-0">Ainda sem faturação.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <section className="rs-card" aria-labelledby="cp-team">
          <div className="rs-card-head">
            <h2 id="cp-team">Colegas com quem partilha</h2>
            <span className="aside">{links.colleagues.length || ""}</span>
          </div>
          <div className="rs-card-body">
            {links.colleagues.length ? (
              <ul className="rs-links">
                {links.colleagues.map(({ id, count }) => {
                  const other = db.consultants.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <Link href={`/reorgsi/consultores/${id}`}>
                        <Avatar consultant={other} size={28} />
                        <span className="min-w-0 flex-1 truncate">{other?.name ?? "—"}</span>
                        <span className="num">
                          {count} negócio{count === 1 ? "" : "s"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rs-empty m-0">Sem negócios partilhados com a equipa.</p>
            )}
          </div>
        </section>
        <section className="rs-card" aria-labelledby="cp-ext">
          <div className="rs-card-head">
            <h2 id="cp-ext">Agências e parceiros</h2>
            <span className="aside">{links.externals.length || ""}</span>
          </div>
          <div className="rs-card-body">
            {links.externals.length ? (
              <ul className="rs-links">
                {links.externals.map(({ name, count }) => (
                  <li key={name}>
                    <Link href={`/reorgsi/negocios?mes=&q=${encodeURIComponent(name)}`}>
                      <span className="rs-avatar ext" style={{ width: 28, height: 28, fontSize: 10 }} aria-hidden="true">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="num">
                        {count} negócio{count === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rs-empty m-0">Sem partilhas com outras agências.</p>
            )}
          </div>
        </section>
        <section className="rs-card" aria-labelledby="cp-mix">
          <div className="rs-card-head">
            <h2 id="cp-mix">Como trabalha</h2>
            <span className="aside">todos os negócios</span>
          </div>
          <div className="rs-card-body">
            <Mix
              parts={[
                { label: "Plenos (as duas partes)", value: links.roles.pleno, color: "#345b63" },
                { label: "Só angariação", value: links.roles.angariacao, color: "#7fb59a" },
                { label: "Só compradores", value: links.roles.compradores, color: "#a9d4bb" },
                { label: "Processo bancário", value: links.roles.bancario, color: "#c3d6d0" },
              ]}
            />
            {links.types.length > 0 && (
              <ul className="m-0 mt-4 flex list-none flex-wrap gap-1.5 p-0">
                {links.types.map(({ id, count }) => (
                  <li key={id} className="rs-pill teal">
                    {db.dealTypes.find((t) => t.id === id)?.name ?? "—"} · {count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {unpaid.length > 0 && (
        <section className="rs-card mb-4" aria-labelledby="cp-unpaid">
          <div className="rs-card-head">
            <h2 id="cp-unpaid">Faturas por receber</h2>
            <span className="aside">{money(unpaidShare)} para o manager</span>
          </div>
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Negócio</th>
                  <th>Mês</th>
                  <th className="right">Valor s/IVA</th>
                  <th className="right">Saldo manager</th>
                </tr>
              </thead>
              <tbody>
                {unpaid.map(({ inv, deal }) => (
                  <tr key={inv.id}>
                    <td className="font-semibold">N.º {inv.number || "?"}</td>
                    <td>
                      <Link className="row-link" href={`/reorgsi/negocios/${deal.id}`}>
                        {deal.ref || deal.address}
                      </Link>
                    </td>
                    <td>{monthName(inv.settlementMonth)}</td>
                    <td className="right num">{money(inv.valueNoVat)}</td>
                    <td className="right num font-semibold">{money(managerShare(inv, deal, db.dealTypes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rs-card" aria-labelledby="cp-deals">
        <div className="rs-card-head">
          <h2 id="cp-deals">Negócios</h2>
          <span className="aside">
            {links.deals.length} · {open} em curso
          </span>
        </div>
        {links.deals.length ? (
          <div className="rs-table-wrap">
            <table className="rs-table rs-cdeals">
              <thead>
                <tr>
                  <th>Ref. do imóvel</th>
                  <th>Papel</th>
                  <th>Do outro lado</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="right">Preço</th>
                  <th className="right">Faturado s/IVA</th>
                  <th>Documentos</th>
                </tr>
              </thead>
              <tbody>
                {links.deals.map(({ deal, role, other }) => (
                  <tr key={deal.id}>
                    <td>
                      <Link className="row-link" href={`/reorgsi/negocios/${deal.id}`}>
                        {deal.ref || (deal.transaction === "credito" ? "Crédito" : "Sem ref.")}
                      </Link>
                      <span className="rs-sub" title={deal.address}>
                        {deal.address}
                      </span>
                    </td>
                    <td>
                      <span className={`rs-pill ${role === "pleno" ? "jade" : ""}`}>{ROLE_LABEL[role]}</span>
                    </td>
                    <td>{role === "pleno" ? <span style={{ color: "var(--faint)" }}>—</span> : <PartyLabel db={db} party={other} />}</td>
                    <td>
                      <span className="rs-pill teal">{db.dealTypes.find((t) => t.id === deal.dealTypeId)?.name ?? "—"}</span>
                    </td>
                    <td>
                      <DealStatusPill status={deal.status} />
                    </td>
                    <td className="right num">{money0(deal.price)}</td>
                    <td className="right num">{money(dealBilled(db, deal))}</td>
                    <td>
                      <DocRing db={db} deal={deal} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rs-empty m-0">Ainda sem negócios.</p>
        )}
      </section>

      {editing && <ConsultantForm consultant={c} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Every deal this consultant is on, who sat on the other side, and how often. */
function connections(deals: Deal[], id: string) {
  const rows: { deal: Deal; role: Role; other?: Party }[] = [];
  const colleagues = new Map<string, number>();
  const externals = new Map<string, number>();
  const types = new Map<string, number>();
  const roles: Record<Role, number> = { pleno: 0, angariacao: 0, compradores: 0, bancario: 0 };

  for (const d of deals) {
    const a = teamId(d.angariacao);
    const b = teamId(d.compradores);
    if (a !== id && b !== id) continue;
    const role: Role = d.transaction === "credito" ? "bancario" : a === id && b === id ? "pleno" : a === id ? "angariacao" : "compradores";
    const other = role === "angariacao" ? d.compradores : role === "compradores" ? d.angariacao : undefined;
    rows.push({ deal: d, role, other });
    roles[role]++;
    types.set(d.dealTypeId, (types.get(d.dealTypeId) ?? 0) + 1);
    if (other?.kind === "team" && other.consultantId !== id) colleagues.set(other.consultantId, (colleagues.get(other.consultantId) ?? 0) + 1);
    if (other?.kind === "external" && other.name.trim()) externals.set(other.name.trim(), (externals.get(other.name.trim()) ?? 0) + 1);
  }

  const byCount = <K,>(m: Map<K, number>) => [...m].sort((x, y) => y[1] - x[1]);
  return {
    deals: rows.sort((x, y) => y.deal.createdAt.localeCompare(x.deal.createdAt)),
    colleagues: byCount(colleagues).map(([cid, count]) => ({ id: cid, count })),
    externals: byCount(externals).map(([name, count]) => ({ name, count })),
    types: byCount(types).map(([tid, count]) => ({ id: tid, count })),
    roles,
  };
}

/** The face, which takes a new photo: click to choose, or drop an image. */
function PhotoSlot({ consultant: c }: { consultant: Consultant }) {
  const { dispatch, upload, notify } = useReorg();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Escolha uma imagem (JPG, PNG ou WebP).", true);
    setBusy(true);
    try {
      const ref = await upload(await preparePhoto(file));
      if (ref && (await dispatch({ type: "consultant.save", consultant: { ...c, photo: ref } })).ok) notify("Foto de perfil guardada.");
    } catch {
      notify("Não foi possível ler esta imagem.", true);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if ((await dispatch({ type: "consultant.save", consultant: { ...c, photo: undefined } })).ok) notify("Foto de perfil removida.");
  }

  return (
    <div className="rs-photo-wrap">
      <button
        type="button"
        className="rs-photo"
        data-over={over || undefined}
        data-busy={busy || undefined}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        aria-label={c.photo ? `Alterar foto de ${c.name}` : `Carregar foto de ${c.name}`}
        title={c.photo ? "Alterar foto" : "Carregar foto"}
      >
        <Avatar consultant={c} size={88} />
        <span className="cam" aria-hidden="true">
          <IconCamera size={16} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {c.photo && (
        <button type="button" className="rs-photo-clear" onClick={clear} aria-label={`Remover foto de ${c.name}`} title="Remover foto">
          <IconTrash size={13} />
        </button>
      )}
    </div>
  );
}
