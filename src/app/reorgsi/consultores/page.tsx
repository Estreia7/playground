"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Consultant, ConsultantStatus, Prize } from "../core/types.ts";
import { PRIZE_NAMES, STATUS_LABEL, prizesOf } from "../core/types.ts";
import { billingByConsultant, dealCountByConsultant, dealMixByConsultant, growth } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { Panel, PrizeChip, numberText, parseNumber } from "../ui/parts.tsx";
import { date, initials, money, percent } from "../ui/format.ts";
import { IconClose, IconPlus } from "../ui/Icons.tsx";
import { Select } from "../ui/Select.tsx";

/* The team: who is in it, in which stage, and what they billed. This year's
   billing comes from the deals; earlier years from the team sheet. */

const YEAR = String(new Date().getFullYear());
const PREV = String(Number(YEAR) - 1);

function StatusPill({ status }: { status: ConsultantStatus }) {
  const tone = status === "experiente" ? "jade" : status === "rookie" ? "teal" : "";
  return <span className={`rs-pill ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export default function ConsultantsPage() {
  const { db } = useReorg();
  const [filter, setFilter] = useState<"" | ConsultantStatus>("");
  const [editing, setEditing] = useState<Consultant | "new" | null>(null);

  const billing = useMemo(() => billingByConsultant(db, YEAR), [db]);
  const deals = useMemo(() => dealCountByConsultant(db), [db]);
  const mix = useMemo(() => dealMixByConsultant(db), [db]);

  const rows = db.consultants
    .filter((c) => (filter ? c.status === filter : c.status !== "inativo"))
    .map((c) => {
      const now = billing.get(c.id) ?? 0;
      const prev = c.billingByYear[PREV] ?? 0;
      return { c, now, prev, g: growth(now, prev) };
    })
    .sort((a, b) => b.now - a.now || a.c.name.localeCompare(b.c.name, "pt"));

  const counts = {
    rookie: db.consultants.filter((c) => c.status === "rookie").length,
    experiente: db.consultants.filter((c) => c.status === "experiente").length,
    inativo: db.consultants.filter((c) => c.status === "inativo").length,
  };

  return (
    <>
      <PageHeader
        title="Consultores"
        sub={`${counts.experiente} experientes · ${counts.rookie} rookies · ${counts.inativo} inativos`}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setEditing("new")}>
            <IconPlus size={17} />
            Novo consultor
          </button>
        }
      />
      <section className="rs-card">
        <div className="rs-filters">
          <div className="rs-seg" role="group" aria-label="Estado">
            {(
              [
                ["", "Ativos"],
                ["experiente", "Experientes"],
                ["rookie", "Rookies"],
                ["inativo", "Inativos"],
              ] as const
            ).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Estado</th>
                <th>Entrada</th>
                <th className="right">Negócios</th>
                <th className="right" title="Plenos: as duas partes do negócio. Partilhas: só uma parte. CB: processos bancários.">
                  Plenos / Partilhas
                </th>
                <th className="right">Faturação {PREV}</th>
                <th className="right">Faturação {YEAR}</th>
                <th className="right">Crescimento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, now, prev, g }) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: c.status === "inativo" ? "var(--canvas)" : "var(--jade)", color: "var(--ink)" }}
                        aria-hidden="true"
                      >
                        {initials(c.name)}
                      </span>
                      <span className="font-semibold">{c.name}</span>
                      {prizesOf(c).map((p) => (
                        <PrizeChip key={p.name + p.year} prize={p} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td className="num">{date(c.joinedAt)}</td>
                  <td className="right num">
                    {deals.get(c.id) ? (
                      <Link className="rs-link" href={`/reorgsi/negocios?consultor=${c.id}`}>
                        {deals.get(c.id)}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="right num">
                    {mixLabel(mix.get(c.id))}
                  </td>
                  <td className="right num">{prev ? money(prev, 0) : "—"}</td>
                  <td className="right num font-semibold">{now ? money(now, 0) : "—"}</td>
                  <td className="right num" style={{ color: g == null ? "var(--faint)" : g >= 0 ? "#2f7a57" : "var(--amber)" }}>
                    {g == null ? "—" : (g >= 0 ? "+" : "") + percent(g * 100, 0)}
                  </td>
                  <td className="right">
                    <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(c)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="rs-empty">Ninguém com este estado.</div>}
        </div>
      </section>
      {editing && <ConsultantForm consultant={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ConsultantForm({ consultant, onClose }: { consultant?: Consultant; onClose: () => void }) {
  const { dispatch, notify } = useReorg();
  const [name, setName] = useState(consultant?.name ?? "");
  const [status, setStatus] = useState<ConsultantStatus>(consultant?.status ?? "rookie");
  const [joinedAt, setJoinedAt] = useState(consultant?.joinedAt ?? "");
  const [phone, setPhone] = useState(consultant?.phone ?? "");
  const [prev, setPrev] = useState(numberText(consultant?.billingByYear[PREV]));
  const [prizes, setPrizes] = useState<Prize[]>(() => (consultant ? prizesOf(consultant) : []));
  const [prizeName, setPrizeName] = useState(PRIZE_NAMES[0]);
  const [prizeYear, setPrizeYear] = useState(PREV);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return notify("Indique o nome.", true);
    setSaving(true);
    const billingByYear = { ...(consultant?.billingByYear ?? {}) };
    const p = parseNumber(prev);
    if (p == null) delete billingByYear[PREV];
    else billingByYear[PREV] = p;
    const res = await dispatch({
      type: "consultant.save",
      consultant: { ...consultant, id: consultant?.id, name, status, joinedAt: joinedAt || undefined, phone: phone.trim() || undefined, billingByYear, prizes, prize: undefined },
    });
    setSaving(false);
    if (res.ok) {
      notify(consultant ? "Consultor guardado." : "Consultor adicionado.");
      onClose();
    }
  }

  async function remove() {
    if (!consultant || !window.confirm(`Apagar ${consultant.name}?`)) return;
    const res = await dispatch({ type: "consultant.delete", id: consultant.id });
    if (res.ok) {
      notify("Consultor apagado.");
      onClose();
    }
  }

  return (
    <Panel
      title={consultant ? consultant.name : "Novo consultor"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save} disabled={saving}>
            {saving ? "A guardar…" : consultant ? "Guardar" : "Adicionar consultor"}
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {consultant && (
            <button type="button" className="rs-btn ghost danger ml-auto" onClick={remove}>
              Apagar
            </button>
          )}
        </>
      }
    >
      <label className="rs-field">
        Nome
        <input className="rs-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="rs-field">
        Telemóvel
        <input className="rs-input num" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="912 345 678" />
        <span className="hint">Usado para pedir documentos pelo WhatsApp.</span>
      </label>
      <div className="rs-field">
        Estado
        <div className="rs-seg" role="group" aria-label="Estado">
          {(Object.keys(STATUS_LABEL) as ConsultantStatus[]).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="hint">Quem tem negócios não pode ser apagado; passe-o a inativo.</span>
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Data de entrada
          <input className="rs-input" type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
        </label>
        <label className="rs-field">
          Faturação {PREV}
          <input className="rs-input num" inputMode="decimal" value={prev} onChange={(e) => setPrev(e.target.value)} placeholder="0,00" />
        </label>
      </div>
      <div className="rs-field">
        Prémios
        <div className="flex flex-wrap items-center gap-1.5">
          {prizes.length === 0 && <span className="hint">Sem prémios.</span>}
          {prizes.map((p) => (
            <span key={p.name + p.year} className="inline-flex items-center">
              <PrizeChip prize={p} />
              <button
                type="button"
                className="rs-btn ghost sm"
                style={{ minHeight: 24, padding: "0 4px" }}
                onClick={() => setPrizes(prizes.filter((x) => x !== p))}
                aria-label={`Remover ${p.name} ${p.year}`}
              >
                <IconClose size={13} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            style={{ width: 150 }}
            value={prizeName}
            onChange={setPrizeName}
            ariaLabel="Prémio"
            options={PRIZE_NAMES.map((n) => ({ value: n, label: n.charAt(0) + n.slice(1).toLowerCase() }))}
          />
          <input
            className="rs-input num"
            style={{ width: 96 }}
            inputMode="numeric"
            value={prizeYear}
            onChange={(e) => setPrizeYear(e.target.value.replace(/D/g, "").slice(0, 4))}
            aria-label="Ano do prémio"
          />
          <button
            type="button"
            className="rs-btn sm"
            disabled={prizeYear.length !== 4 || prizes.some((p) => p.name === prizeName && p.year === prizeYear)}
            onClick={() => setPrizes([...prizes, { name: prizeName, year: prizeYear }].sort((a, b) => b.year.localeCompare(a.year)))}
          >
            Adicionar prémio
          </button>
        </div>
        <span className="hint">Aparece como "Ruby 25": o prémio e o ano em que foi ganho.</span>
      </div>
    </Panel>
  );
}

function mixLabel(m: { plenos: number; partilhas: number; bancarios: number } | undefined): string {
  if (!m) return "—";
  return `${m.plenos} / ${m.partilhas}${m.bancarios ? ` · ${m.bancarios} CB` : ""}`;
}
