"use client";

import { useState } from "react";
import type { Deal, DealStatus, Invoice, InvoicePhase, InvoiceStatus, Party, Transaction } from "../core/types.ts";
import { CPCV_SHARE, DEFAULT_COMMISSION_PCT, PHASE_LABEL, STATUS_LABEL, TRANSACTION_LABEL } from "../core/types.ts";
import { teamFraction } from "../core/analytics.ts";
import { useReorg } from "./App.tsx";
import { Panel, numberText, parseNumber } from "./parts.tsx";
import { PersonPicker } from "./PersonPicker.tsx";
import { percent, today } from "./format.ts";
import { Select } from "./Select.tsx";

/* The deal and invoice forms, both in a side panel. */

function PartyField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: Party | undefined;
  onChange: (p: Party | undefined) => void;
  optional?: boolean;
}) {
  const { db } = useReorg();
  const team = db.consultants.filter((c) => c.status !== "inativo" || (value?.kind === "team" && value.consultantId === c.id));
  const mode = !value ? "" : value.kind === "team" ? value.consultantId : "__external";
  return (
    <div className="rs-field">
      {label}
      <PersonPicker
        value={mode}
        ariaLabel={label}
        onChange={(v) => {
          if (!v) onChange(undefined);
          else if (v === "__external") onChange({ kind: "external", name: value?.kind === "external" ? value.name : "", note: value?.note });
          else onChange({ kind: "team", consultantId: v, note: value?.note });
        }}
        options={[
          ...(optional ? [{ value: "", label: "Sem este lado", person: false }] : []),
          ...team.map((c) => ({ value: c.id, label: c.name, group: "Equipa", hint: STATUS_LABEL[c.status] })),
          { value: "__external", label: "Outra agência ou consultor…", group: "Fora da equipa", person: false },
        ]}
      />
      {value?.kind === "external" && (
        <input
          className="rs-input"
          placeholder="Nome da agência ou do consultor"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          aria-label={`${label}: nome externo`}
        />
      )}
      {value && (
        <input
          className="rs-input"
          placeholder="Nota (ex.: ref C21 Heritage)"
          value={value.note ?? ""}
          onChange={(e) => onChange({ ...value, note: e.target.value || undefined })}
          aria-label={`${label}: nota`}
        />
      )}
    </div>
  );
}

export function DealForm({ deal, onClose, onSaved }: { deal?: Deal; onClose: () => void; onSaved?: (id: string) => void }) {
  const { db, dispatch, notify } = useReorg();
  const [ref, setRef] = useState(deal?.ref ?? "");
  const [listingUrl, setListingUrl] = useState(deal?.listingUrl ?? "");
  const [transaction, setTransaction] = useState<Transaction>(deal?.transaction ?? "venda");
  const [price, setPrice] = useState(numberText(deal?.price));
  const [address, setAddress] = useState(deal?.address ?? "");
  const [dealTypeId, setDealTypeId] = useState(deal?.dealTypeId ?? db.dealTypes.find((t) => t.active)?.id ?? "");
  const [angariacao, setAngariacao] = useState<Party | undefined>(deal?.angariacao);
  const [compradores, setCompradores] = useState<Party | undefined>(deal?.compradores);
  // A new deal starts at the standard 5%; an imported one keeps what it had.
  const [commissionPct, setCommissionPct] = useState(numberText(deal ? deal.commissionPct : DEFAULT_COMMISSION_PCT));
  const [cpcvSplit, setCpcvSplit] = useState<boolean | undefined>(deal ? deal.cpcvSplit : false);
  const [split, setSplit] = useState(String(deal?.listingSplitPct ?? 50));
  const [status, setStatus] = useState<DealStatus>(deal?.status ?? "aberto");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const type = db.dealTypes.find((t) => t.id === dealTypeId);
  const p = parseNumber(price);
  const c = parseNumber(commissionPct);
  const total = p != null && c != null ? (p * c) / 100 : undefined;
  const isSale = transaction === "venda" && type?.sides !== "bank";
  const splitPct = Math.min(100, Math.max(0, parseNumber(split) ?? 50));
  // Until the sides are chosen, show the whole commission.
  const fraction = angariacao || compradores ? teamFraction({ angariacao: angariacao ?? { kind: "external", name: "" }, compradores, listingSplitPct: splitPct } as Deal) : 1;
  const team = total != null ? total * fraction : undefined;
  const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  async function save() {
    if (!angariacao || (angariacao.kind === "external" && !angariacao.name.trim())) {
      notify("Indique quem fez a angariação.", true);
      return;
    }
    if (!ref.trim() && !address.trim()) {
      notify("Indique a referência ou a morada.", true);
      return;
    }
    setSaving(true);
    const res = await dispatch({
      type: "deal.save",
      deal: {
        id: deal?.id,
        ref,
        listingUrl: listingUrl.trim() || undefined,
        transaction,
        price: p,
        address,
        dealTypeId,
        angariacao,
        compradores: type?.sides === "bank" ? undefined : compradores,
        commissionPct: c,
        listingSplitPct: splitPct,
        cpcvSplit: isSale ? cpcvSplit : undefined,
        status,
        notes: notes.trim() || undefined,
      },
    });
    setSaving(false);
    if (res.ok) {
      notify(deal ? "Negócio guardado." : "Negócio criado.");
      onSaved?.(res.id ?? deal?.id ?? "");
      onClose();
    }
  }

  return (
    <Panel
      title={deal ? "Editar negócio" : "Novo negócio"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save} disabled={saving}>
            {saving ? "A guardar…" : deal ? "Guardar negócio" : "Criar negócio"}
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="rs-grid-2">
        <label className="rs-field">
          Ref. do imóvel
          <input className="rs-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="C0240-03577" />
        </label>
        <label className="rs-field">
          Transação
          <Select
            value={transaction}
            onChange={(v) => setTransaction(v as Transaction)}
            ariaLabel="Transação"
            options={Object.entries(TRANSACTION_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
        </label>
      </div>
      <label className="rs-field">
        Link do anúncio
        <input className="rs-input" type="url" inputMode="url" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="https://…" />
        <span className="hint">A captura do anúncio adiciona-se na tabela ou na página do negócio.</span>
      </label>
      <label className="rs-field">
        {transaction === "credito" ? "Banco e cliente" : "Morada do imóvel"}
        <input className="rs-input" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className="rs-field">
        Tipo de comissão
        <Select
          value={dealTypeId}
          onChange={setDealTypeId}
          ariaLabel="Tipo de negócio"
          options={db.dealTypes
            .filter((t) => t.active || t.id === dealTypeId)
            .map((t) => ({ value: t.id, label: t.name, hint: percent(t.defaultManagerPct) }))}
        />
      </label>
      <PartyField label={type?.sides === "bank" ? "Consultor do processo" : "Angariação"} value={angariacao} onChange={setAngariacao} />
      {type?.sides !== "bank" && <PartyField label="Compradores" value={compradores} onChange={setCompradores} optional />}
      <div className="rs-grid-2">
        <label className="rs-field">
          {transaction === "credito" ? "Montante" : transaction === "arrendamento" ? "Renda" : "Preço de venda"}
          <input className="rs-input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00 €" />
        </label>
        <label className="rs-field">
          % de comissão
          <input className="rs-input num" inputMode="decimal" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder={String(DEFAULT_COMMISSION_PCT)} />
          <span className="hint num">
            {total != null ? `Comissão total: ${eur(total)}` : `Normalmente ${DEFAULT_COMMISSION_PCT}% do preço de venda.`}
          </span>
        </label>
      </div>
      {team != null && fraction > 0 && fraction < 1 && (
        <p className="rs-form-note num">
          Partilha: conta {Math.round(fraction * 100)}% para a equipa, <strong>{eur(team)}</strong>.
        </p>
      )}
      {isSale && (
        <div className="rs-field">
          <label className="rs-check">
            <input type="checkbox" checked={cpcvSplit === true} onChange={(e) => setCpcvSplit(e.target.checked)} />
            <span>
              Recebe 50% da comissão no CPCV
              <span className="hint">
                {cpcvSplit && team != null
                  ? `CPCV ${eur(team * CPCV_SHARE)} · Escritura ${eur(team - team * CPCV_SHARE)}`
                  : "Sem esta opção, a comissão é toda faturada na escritura."}
              </span>
            </span>
          </label>
          {cpcvSplit == null && (
            <span className="rs-form-note warn">
              Ainda não indicado neste negócio. Marque a opção se recebe 50% no CPCV, ou{" "}
              <button type="button" className="rs-link" style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }} onClick={() => setCpcvSplit(false)}>
                confirme que é tudo na escritura
              </button>
              .
            </span>
          )}
        </div>
      )}
      {type?.sides !== "bank" && (
        <label className="rs-field">
          Divisão angariação / compradores
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={parseNumber(split) ?? 50}
              onChange={(e) => setSplit(e.target.value)}
              className="flex-1"
              style={{ accentColor: "var(--teal)" }}
              aria-valuetext={`${split}% angariação, ${100 - (parseNumber(split) ?? 50)}% compradores`}
            />
            <span className="num w-24 text-right text-sm">
              {split} / {100 - (parseNumber(split) ?? 50)}
            </span>
          </div>
        </label>
      )}
      <label className="rs-field">
        Estado
        <Select
          value={status}
          onChange={(v) => setStatus(v as DealStatus)}
          ariaLabel="Estado"
          options={[
            { value: "aberto", label: "Em curso" },
            { value: "concluido", label: "Concluído" },
            { value: "anulado", label: "Anulado" },
          ]}
        />
      </label>
      <label className="rs-field">
        Notas
        <textarea className="rs-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Panel>
  );
}

export function InvoiceForm({
  dealId,
  invoice,
  phase: presetPhase,
  value: presetValue,
  defaultPct,
  onClose,
}: {
  dealId: string;
  invoice?: Invoice;
  /** For a new invoice opened from a phase: its phase and expected value. */
  phase?: InvoicePhase;
  value?: number;
  defaultPct: number;
  onClose: () => void;
}) {
  const { dispatch, notify } = useReorg();
  const [phase, setPhase] = useState<InvoicePhase>(invoice?.phase ?? presetPhase ?? "total");
  const [number, setNumber] = useState(invoice?.number ?? "");
  const [issuedAt, setIssuedAt] = useState(invoice?.issuedAt ?? today());
  const [paidAt, setPaidAt] = useState(invoice?.paidAt ?? "");
  const [month, setMonth] = useState(invoice?.settlementMonth ?? today().slice(0, 7));
  const [value, setValue] = useState(numberText(invoice?.valueNoVat ?? (presetValue != null ? Math.round(presetValue * 100) / 100 : undefined)));
  const [pct, setPct] = useState(numberText(invoice?.managerPctOverride));
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "emitida");
  const [flag, setFlag] = useState(invoice?.flag);
  const [saving, setSaving] = useState(false);

  const v = parseNumber(value);
  const effectivePct = parseNumber(pct) ?? defaultPct;

  async function save() {
    if (v == null) {
      notify("Indique o valor da fatura sem IVA.", true);
      return;
    }
    setSaving(true);
    const res = await dispatch({
      type: "invoice.save",
      invoice: {
        id: invoice?.id,
        dealId,
        phase,
        number: number.trim(),
        issuedAt: issuedAt || undefined,
        paidAt: paidAt || undefined,
        settlementMonth: month,
        valueNoVat: v,
        managerPctOverride: parseNumber(pct),
        status: status === "anulada" ? "anulada" : paidAt ? "paga" : status,
        file: invoice?.file,
        flag,
      },
    });
    setSaving(false);
    if (res.ok) {
      notify(invoice ? "Fatura guardada." : "Fatura adicionada.");
      onClose();
    }
  }

  return (
    <Panel
      title={invoice ? `Fatura ${invoice.number}` : "Nova fatura"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save} disabled={saving}>
            {saving ? "A guardar…" : invoice ? "Guardar fatura" : "Adicionar fatura"}
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      {flag && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--amber-bg)", color: "#7a4b0e" }}>
          {flag}
          <button type="button" className="rs-btn sm ml-2" onClick={() => setFlag(undefined)}>
            Marcar como verificada
          </button>
        </div>
      )}
      <div className="rs-grid-2">
        <label className="rs-field">
          Fase
          <Select
            value={phase}
            onChange={(v) => setPhase(v as InvoicePhase)}
            ariaLabel="Fase"
            options={Object.entries(PHASE_LABEL).map(([k, l]) => ({ value: k, label: l }))}
          />
        </label>
        <label className="rs-field">
          N.º da fatura
          <input className="rs-input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="204|205" />
        </label>
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Emissão
          <input className="rs-input" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </label>
        <label className="rs-field">
          Pagamento
          <input
            className="rs-input"
            type="date"
            value={paidAt}
            onChange={(e) => {
              setPaidAt(e.target.value);
              if (e.target.value && !invoice) setMonth(e.target.value.slice(0, 7));
            }}
          />
        </label>
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Valor sem IVA
          <input className="rs-input num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
        </label>
        <label className="rs-field">
          % do manager
          <input
            className="rs-input num"
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder={`${numberText(defaultPct)} (do tipo)`}
          />
          <span className="hint num">
            Saldo: {v != null ? ((v * effectivePct) / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—"}
          </span>
        </label>
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Mês na conta corrente
          <input className="rs-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="rs-field">
          Estado
          <Select
            value={paidAt && status !== "anulada" ? "paga" : status}
            onChange={(v) => setStatus(v as InvoiceStatus)}
            ariaLabel="Estado da fatura"
            options={[
              { value: "emitida", label: "Por pagar" },
              { value: "paga", label: "Paga" },
              { value: "anulada", label: "Anulada" },
            ]}
          />
        </label>
      </div>
      <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
        O PDF da fatura adiciona-se na lista de faturas do negócio, a qualquer altura.
      </p>
    </Panel>
  );
}
