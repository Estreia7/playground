"use client";

import { useState } from "react";
import type { Listing, ListingKind } from "../core/types.ts";
import { DEFAULT_COMMISSION_PCT, LISTING_KIND_LABEL, STATUS_LABEL } from "../core/types.ts";
import { potential } from "../core/listings.ts";
import { useReorg } from "./App.tsx";
import { Panel, numberText, parseNumber } from "./parts.tsx";
import { PersonPicker } from "./PersonPicker.tsx";
import { Select } from "./Select.tsx";
import { money0 } from "./format.ts";

/* Add or edit an angariação: who took it, what it is, its value and commission. */

export function ListingForm({ listing, onClose }: { listing?: Listing; onClose: () => void }) {
  const { db, dispatch, notify } = useReorg();
  const [consultantId, setConsultantId] = useState(listing?.consultantId ?? "");
  const [kind, setKind] = useState<ListingKind>(listing?.kind ?? "apartamento");
  const [price, setPrice] = useState(numberText(listing?.price));
  const [pct, setPct] = useState(numberText(listing?.commissionPct ?? DEFAULT_COMMISSION_PCT));
  const [saving, setSaving] = useState(false);

  const value = parseNumber(price);
  const commission = parseNumber(pct);
  const team = db.consultants.filter((c) => c.status !== "inativo" || c.id === listing?.consultantId);

  async function save() {
    if (!consultantId) return notify("Escolha o consultor.", true);
    if (!value || value <= 0) return notify("Indique o valor do imóvel.", true);
    if (commission == null || commission < 0) return notify("Indique a percentagem de comissão.", true);
    setSaving(true);
    const res = await dispatch({ type: "listing.save", listing: { id: listing?.id, consultantId, kind, price: value, commissionPct: commission } });
    setSaving(false);
    if (res.ok) {
      notify(listing ? "Angariação guardada." : "Angariação adicionada.");
      onClose();
    }
  }

  async function remove() {
    if (!listing || !window.confirm("Apagar esta angariação?")) return;
    if ((await dispatch({ type: "listing.delete", id: listing.id })).ok) {
      notify("Angariação apagada.");
      onClose();
    }
  }

  return (
    <Panel
      title={listing ? "Angariação" : "Nova angariação"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save} disabled={saving}>
            {saving ? "A guardar…" : listing ? "Guardar" : "Adicionar angariação"}
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {listing && (
            <button type="button" className="rs-btn ghost danger ml-auto" onClick={remove}>
              Apagar
            </button>
          )}
        </>
      }
    >
      <div className="rs-field">
        Consultor
        <PersonPicker
          value={consultantId}
          onChange={setConsultantId}
          ariaLabel="Consultor"
          options={team.map((c) => ({ value: c.id, label: c.name, hint: STATUS_LABEL[c.status] }))}
        />
      </div>
      <div className="rs-field">
        Tipo
        <Select
          value={kind}
          onChange={(v) => setKind(v as ListingKind)}
          ariaLabel="Tipo de imóvel"
          options={(Object.keys(LISTING_KIND_LABEL) as ListingKind[]).map((k) => ({ value: k, label: LISTING_KIND_LABEL[k] }))}
        />
      </div>
      <div className="rs-grid-2">
        <label className="rs-field">
          Valor
          <input className="rs-input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
        </label>
        <label className="rs-field">
          % comissão
          <input className="rs-input num" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
      </div>
      {value != null && commission != null && value > 0 && (
        <p className="rs-form-note">
          Potencial de comissão: <strong className="num">{money0(potential({ price: value, commissionPct: commission }))}</strong>
        </p>
      )}
    </Panel>
  );
}
