"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Listing } from "../core/types.ts";
import { DEFAULT_COMMISSION_PCT, LISTING_KIND_LABEL } from "../core/types.ts";
import { PARTILHA_SHARE, expected, listingRows, listingSaleMix, mixYears, potential } from "../core/listings.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { useUrlState } from "../ui/nav.tsx";
import { Avatar } from "../ui/parts.tsx";
import { ListingForm } from "../ui/ListingForm.tsx";
import { Kpi, Mix } from "../ui/stats.tsx";
import { IconPlus } from "../ui/Icons.tsx";
import { money0, percent } from "../ui/format.ts";

/* Angariações: how many properties each consultant has taken on, at what
   commission, and what they could bring once sold. */

const YEARS = mixYears();

type Scenario = "media" | "metade";

export default function ListingsPage() {
  const { db } = useReorg();
  const [scenario, setScenario] = useUrlState<Scenario>("cenario", "media");
  const [editing, setEditing] = useState<Listing | "new" | null>(null);
  const mix = useMemo(() => listingSaleMix(db, YEARS), [db]);
  const ratio = scenario === "metade" ? 0.5 : mix.plenoRatio;

  const rows = useMemo(() => {
    const name = (id: string) => db.consultants.find((c) => c.id === id)?.name ?? "";
    return listingRows(db).sort((a, b) => b.count - a.count || name(a.consultantId).localeCompare(name(b.consultantId), "pt"));
  }, [db]);

  const listings = useMemo(() => [...(db.listings ?? [])].filter((l) => l.status === "ativa").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.listings]);

  const totals = rows.reduce(
    (s, r) => ({ count: s.count + r.count, portfolio: s.portfolio + r.portfolio, ifPleno: s.ifPleno + r.ifPleno, ifPartilha: s.ifPartilha + r.ifPartilha }),
    { count: 0, portfolio: 0, ifPleno: 0, ifPartilha: 0 },
  );
  const sold = mix.plenos + mix.partilhas;

  return (
    <>
      <PageHeader
        title="Angariações"
        sub={`${totals.count} ${totals.count === 1 ? "angariação ativa" : "angariações ativas"} · ${rows.length} consultores`}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setEditing("new")}>
            <IconPlus size={17} />
            Nova angariação
          </button>
        }
      />

      <div className="rs-kpis">
        <Kpi label="Potencial esperado" value={money0(expected(totals, ratio))} count={expected(totals, ratio)} format={money0} hero>
          <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
            {scenario === "metade" ? "Metade plenos, metade partilhas" : `Com a média de ${YEARS.join(" e ")}`}
          </span>
        </Kpi>
        <Kpi label="Angariações ativas" value={String(totals.count)} count={totals.count} format={(n) => String(Math.round(n))}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {money0(totals.portfolio)} em carteira
          </span>
        </Kpi>
        <Kpi label="Se forem todas plenos" value={money0(totals.ifPleno)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Comissão inteira
          </span>
        </Kpi>
        <Kpi label="Se forem todas partilhas" value={money0(totals.ifPartilha)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {Math.round(PARTILHA_SHARE * 100)}% da comissão
          </span>
        </Kpi>
      </div>

      <section className="rs-card mb-4" aria-labelledby="mix-h">
        <div className="rs-card-head">
          <h2 id="mix-h">Como vendem as nossas angariações</h2>
          <span className="aside">{YEARS.join(" e ")}</span>
        </div>
        <div className="rs-card-body grid grid-cols-[minmax(0,1fr)] items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="m-0 mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
              {sold ? (
                <>
                  Das <strong className="num">{sold}</strong> vendas com angariação da equipa, <strong className="num">{percent(mix.plenoRatio * 100, 0)}</strong> foram plenos e{" "}
                  <strong className="num">{percent((1 - mix.plenoRatio) * 100, 0)}</strong> partilhas.
                </>
              ) : (
                `Ainda sem vendas com angariação da equipa em ${YEARS.join(" e ")}: a média fica em 50/50.`
              )}
            </p>
            <Mix
              parts={[
                { label: "Plenos", value: mix.plenos, color: "#345b63" },
                { label: "Partilhas", value: mix.partilhas, color: "#a9d4bb" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--muted)" }}>
              Cenário do potencial
            </span>
            <div className="rs-seg" role="group" aria-label="Cenário do potencial">
              <button type="button" aria-pressed={scenario === "media"} onClick={() => setScenario("media")}>
                Média {YEARS.join("–")}
              </button>
              <button type="button" aria-pressed={scenario === "metade"} onClick={() => setScenario("metade")}>
                50 / 50
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rs-card mb-4" aria-labelledby="ls-h">
        <div className="rs-card-head">
          <h2 id="ls-h">Por consultor</h2>
          <span className="aside">Comissão de {DEFAULT_COMMISSION_PCT}% por omissão</span>
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th className="right">Angariações</th>
                <th className="right">Carteira</th>
                <th className="right">% comissão · potencial</th>
                <th className="right">Se partilhas</th>
                <th className="right">Esperado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = db.consultants.find((x) => x.id === r.consultantId);
                return (
                  <tr key={r.consultantId} style={r.count === 0 ? { color: "var(--muted)" } : undefined}>
                    <td data-label="Consultor">
                      <div className="flex items-center gap-2.5">
                        <Avatar consultant={c} size={28} />
                        <Link className="row-link" href={`/reorgsi/consultores/${r.consultantId}`}>
                          {c?.name}
                        </Link>
                      </div>
                    </td>
                    <td className="right num" data-label="Angariações">
                      {r.count}
                    </td>
                    <td className="right num" data-label="Carteira">
                      {money0(r.portfolio)}
                    </td>
                    <td className="right num" data-label="% comissão · potencial">
                      {r.count ? `${percent(r.avgPct)} · ${money0(r.ifPleno)}` : "—"}
                    </td>
                    <td className="right num" data-label="Se partilhas">
                      {money0(r.ifPartilha)}
                    </td>
                    <td className="right num font-semibold" data-label="Esperado">
                      {money0(expected(r, ratio))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t px-[18px] py-3 text-[12.5px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Potencial: a comissão inteira, se for um pleno. Partilha: o comprador vem de outra agência e fica {Math.round(PARTILHA_SHARE * 100)}% para quem angariou. O esperado pesa
          os dois {scenario === "metade" ? "em partes iguais" : `pela média de ${YEARS.join(" e ")}`}.
        </p>
      </section>

      <section className="rs-card" aria-labelledby="lr-h">
        <div className="rs-card-head">
          <h2 id="lr-h">Angariações registadas</h2>
          <span className="aside num">{listings.length}</span>
        </div>
        {listings.length ? (
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Consultor</th>
                  <th className="right">Valor</th>
                  <th className="right">% comissão · potencial</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Tipo">
                      <button
                        type="button"
                        className="row-link"
                        onClick={() => setEditing(l)}
                        style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", fontWeight: 600, cursor: "pointer" }}
                      >
                        {LISTING_KIND_LABEL[l.kind]}
                      </button>
                    </td>
                    <td data-label="Consultor">{db.consultants.find((c) => c.id === l.consultantId)?.name ?? "—"}</td>
                    <td className="right num" data-label="Valor">
                      {money0(l.price)}
                    </td>
                    <td className="right num" data-label="% comissão · potencial">
                      {percent(l.commissionPct)} · {money0(potential(l))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rs-empty m-0">Ainda sem angariações. Use Nova angariação para registar a primeira.</p>
        )}
      </section>

      {editing && <ListingForm listing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
