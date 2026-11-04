"use client";

import { useState } from "react";
import type { Consultant, ConsultantStatus, Prize } from "../core/types.ts";
import { PRIZE_NAMES, STATUS_LABEL, prizesOf } from "../core/types.ts";
import { useReorg } from "./App.tsx";
import { Panel, PrizeChip, numberText, parseNumber } from "./parts.tsx";
import { IconClose } from "./Icons.tsx";
import { Select } from "./Select.tsx";

/* Add or edit a consultant: used by the team list and the consultant page. */

const PREV = String(new Date().getFullYear() - 1);
const PLAN_YEAR = String(new Date().getFullYear());

export function ConsultantForm({ consultant, onClose }: { consultant?: Consultant; onClose: () => void }) {
  const { dispatch, notify } = useReorg();
  const [name, setName] = useState(consultant?.name ?? "");
  const [status, setStatus] = useState<ConsultantStatus>(consultant?.status ?? "rookie");
  const [joinedAt, setJoinedAt] = useState(consultant?.joinedAt ?? "");
  const [prev, setPrev] = useState(numberText(consultant?.billingByYear[PREV]));
  // With monthly figures on record the yearly total is theirs, not typed here.
  const hasMonths = Boolean(consultant?.billingByMonth?.[PREV]);
  const [prizes, setPrizes] = useState<Prize[]>(() => (consultant ? prizesOf(consultant) : []));
  const [prizeName, setPrizeName] = useState(PRIZE_NAMES[0]);
  const [prizeYear, setPrizeYear] = useState(PREV);
  const plan = consultant?.plans?.[PLAN_YEAR];
  const [delivered, setDelivered] = useState(plan?.delivered ?? false);
  const [meetingHeld, setMeetingHeld] = useState(plan?.meetingHeld ?? false);
  const [meetingDate, setMeetingDate] = useState(plan?.meetingDate ?? "");
  const [billingTarget, setBillingTarget] = useState(numberText(plan?.billingTarget));
  const [billingMonthly, setBillingMonthly] = useState(numberText(plan?.billingTargetMonthly));
  const [listingTarget, setListingTarget] = useState(numberText(plan?.listingTarget));
  const [listingMonthly, setListingMonthly] = useState(numberText(plan?.listingTargetMonthly));
  const [activeListings, setActiveListings] = useState(numberText(plan?.activeListings));
  const [saving, setSaving] = useState(false);

  /** The consultant's plans with this year's as filled in; an empty form means no plan. */
  function nextPlans() {
    const figures = {
      billingTarget: parseNumber(billingTarget),
      billingTargetMonthly: parseNumber(billingMonthly),
      listingTarget: parseNumber(listingTarget),
      listingTargetMonthly: parseNumber(listingMonthly),
      activeListings: parseNumber(activeListings),
    };
    const { [PLAN_YEAR]: _old, ...others } = consultant?.plans ?? {};
    const blank = !delivered && !meetingHeld && !meetingDate && Object.values(figures).every((v) => v == null);
    const plans = blank ? others : { ...others, [PLAN_YEAR]: { delivered, meetingHeld, meetingDate: meetingDate || undefined, ...figures } };
    return Object.keys(plans).length ? plans : undefined;
  }

  async function save() {
    if (!name.trim()) return notify("Indique o nome.", true);
    setSaving(true);
    const billingByYear = { ...(consultant?.billingByYear ?? {}) };
    const p = parseNumber(prev);
    if (p == null) delete billingByYear[PREV];
    else billingByYear[PREV] = p;
    const res = await dispatch({
      type: "consultant.save",
      consultant: { ...consultant, id: consultant?.id, name, status, joinedAt: joinedAt || undefined, billingByYear, plans: nextPlans(), prizes, prize: undefined },
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
        {!hasMonths && (
          <label className="rs-field">
            Faturação {PREV}
            <input className="rs-input num" inputMode="decimal" value={prev} onChange={(e) => setPrev(e.target.value)} placeholder="0,00" />
          </label>
        )}
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
            onChange={(e) => setPrizeYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
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
      <div className="rs-field">
        Business Plan {PLAN_YEAR}
        <div className="rs-grid-2">
          <label className="rs-check">
            <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
            <span>Plano entregue</span>
          </label>
          <label className="rs-check">
            <input type="checkbox" checked={meetingHeld} onChange={(e) => setMeetingHeld(e.target.checked)} />
            <span>Reunião realizada</span>
          </label>
        </div>
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Data da reunião
          <input className="rs-input" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
        </label>
        <label className="rs-field">
          Angariações ativas no plano
          <input className="rs-input num" inputMode="numeric" value={activeListings} onChange={(e) => setActiveListings(e.target.value)} placeholder="0" />
        </label>
        <label className="rs-field">
          Objetivo de faturação anual
          <input className="rs-input num" inputMode="decimal" value={billingTarget} onChange={(e) => setBillingTarget(e.target.value)} placeholder="0,00" />
        </label>
        <label className="rs-field">
          Objetivo de faturação mensal
          <input className="rs-input num" inputMode="decimal" value={billingMonthly} onChange={(e) => setBillingMonthly(e.target.value)} placeholder="0,00" />
        </label>
        <label className="rs-field">
          Objetivo de angariações anual
          <input className="rs-input num" inputMode="decimal" value={listingTarget} onChange={(e) => setListingTarget(e.target.value)} placeholder="0" />
        </label>
        <label className="rs-field">
          Objetivo de angariações mensal
          <input className="rs-input num" inputMode="decimal" value={listingMonthly} onChange={(e) => setListingMonthly(e.target.value)} placeholder="0" />
        </label>
      </div>
    </Panel>
  );
}
