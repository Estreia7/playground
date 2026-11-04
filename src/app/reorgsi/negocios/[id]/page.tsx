"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Db, Deal, DocState, Invoice, InvoicePhase } from "../../core/types.ts";
import { DOC_STATE_LABEL, PHASE_LABEL, SIDES_LABEL, TRANSACTION_LABEL } from "../../core/types.ts";
import { dealBilled, dealShare, docProgress, invoicesOf, managerPct, managerShare, requirementsFor } from "../../core/commission.ts";
import { useReorg } from "../../ui/App.tsx";
import { PageHeader } from "../../ui/Shell.tsx";
import { DealForm, InvoiceForm } from "../../ui/forms.tsx";
import { DealStatusPill, DocBar, InvoiceStatusPill, PartyLabel, dealFiles } from "../../ui/parts.tsx";
import { DropSlot, FileThumb, RemoveFile } from "../../ui/files/Files.tsx";
import { date, money, monthName, percent } from "../../ui/format.ts";
import { IconExternal, IconPlus, IconTrash } from "../../ui/Icons.tsx";
import { BackLink } from "../../ui/nav.tsx";
import { PHASE_STATE_LABEL, dealPhases, hasPhases, teamCommission, type Phase } from "../../core/phases.ts";
import { teamFraction } from "../../core/analytics.ts";

/* One deal: the documents it still needs, the money it produced, and every
   file attached to it. */

const STATES: DocState[] = ["confirmado", "em_falta", "na"];

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, dispatch, upload, notify } = useReorg();
  const [editing, setEditing] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<{ invoice?: Invoice; phase?: InvoicePhase; value?: number } | null>(null);

  const deal = db.deals.find((d) => d.id === id);
  // The tab and the history list name the deal, not just "Negócio".
  const ref = deal ? deal.ref || deal.address : "";
  useEffect(() => {
    if (ref) document.title = `${ref} · ReorgSI`;
  }, [ref]);
  if (!deal) {
    return (
      <>
        <PageHeader title="Negócio não encontrado" />
        <div className="rs-card rs-empty">
          Este negócio foi apagado ou o link está errado.{" "}
          <Link className="rs-link" href="/reorgsi/negocios">
            Ver todos os negócios
          </Link>
        </div>
      </>
    );
  }

  const type = db.dealTypes.find((t) => t.id === deal.dealTypeId);
  const reqs = requirementsFor(deal, db.docRequirements);
  const progress = docProgress(deal, db.docRequirements);
  const invoices = invoicesOf(db, deal.id);
  const files = dealFiles(db, deal);
  const label = deal.ref || deal.address;
  const totalCommission = deal.price != null && deal.commissionPct != null ? (deal.price * deal.commissionPct) / 100 : undefined;
  const pending = invoices.filter((i) => i.status === "emitida").reduce((s, i) => s + managerShare(i, deal, db.dealTypes), 0);

  async function setDoc(reqId: string, state: DocState | null) {
    const current = deal!.documents[reqId];
    // Changing the state keeps any file; clearing removes the entry.
    await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: state ? { state, file: current?.file } : null });
  }

  async function attachDoc(reqId: string, name: string, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: { state: "ficheiro", file: ref } })).ok)
      notify(`${name} guardado.`);
  }

  async function removeDocFile(reqId: string) {
    await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: { state: "confirmado" } });
  }

  async function attachShot(file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.shot", dealId: deal!.id, file: ref })).ok) notify("Captura do anúncio guardada.");
  }

  async function removeInvoiceFile(inv: Invoice) {
    if ((await dispatch({ type: "invoice.save", invoice: { ...inv, file: undefined } })).ok) notify(`PDF da fatura ${inv.number} removido.`);
  }

  async function attachInvoice(inv: Invoice, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "invoice.save", invoice: { ...inv, file: ref } })).ok) notify(`PDF da fatura ${inv.number} guardado.`);
  }

  async function removeDeal() {
    if (!window.confirm(`Apagar o negócio ${label} e as suas ${invoices.length} faturas? Isto não se pode desfazer.`)) return;
    if ((await dispatch({ type: "deal.delete", id: deal!.id })).ok) {
      notify("Negócio apagado.");
      router.replace("/reorgsi/negocios");
    }
  }

  return (
    <>
      <BackLink href="/reorgsi/negocios" label="Negócios" />
      <PageHeader
        title={deal.ref || (deal.transaction === "credito" ? "Processo bancário" : "Negócio sem referência")}
        sub={
          <>
            {deal.address} · {TRANSACTION_LABEL[deal.transaction]} · <DealStatusPill status={deal.status} />
          </>
        }
        actions={
          <>
            {deal.listingUrl && (
              <a className="rs-btn" href={deal.listingUrl} target="_blank" rel="noopener noreferrer">
                <IconExternal size={16} />
                Ver anúncio
              </a>
            )}
            <button type="button" className="rs-btn" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" className="rs-btn ghost danger" onClick={removeDeal} aria-label="Apagar negócio">
              <IconTrash size={17} />
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PhasesCard db={db} deal={deal} onEdit={() => setEditing(true)} onInvoice={(phase, value) => setInvoiceForm({ phase, value })} onOpenInvoice={(inv) => setInvoiceForm({ invoice: inv })} />

          {/* Documents */}
          <section className="rs-card" aria-labelledby="docs-h">
            <div className="rs-card-head">
              <h2 id="docs-h">Documentos</h2>
              <span className="aside num">
                {progress.total ? `${Math.round(progress.ratio * 100)}% dos obrigatórios` : "Nenhum obrigatório"}
              </span>
            </div>
            <div className="rs-card-body">
              <DocBar db={db} deal={deal} large />
              <ul className="m-0 mt-4 flex list-none flex-col p-0">
                {reqs.map((r) => {
                  const entry = deal.documents[r.id];
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 border-t py-3" style={{ borderColor: "var(--line)" }}>
                      <div className="min-w-44 flex-1">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                          {r.required ? "Obrigatório" : "Opcional"}
                          {entry ? ` · ${DOC_STATE_LABEL[entry.state]}` : " · por tratar"}
                        </div>
                      </div>
                      {entry?.file ? (
                        <div className="flex items-center gap-1">
                          <FileThumb file={entry.file} label={`${r.name} · ${label}`} set={files} />
                          <button type="button" className="rs-btn ghost sm" onClick={() => removeDocFile(r.id)} aria-label={`Remover ficheiro de ${r.name}`}>
                            <IconTrash size={15} />
                          </button>
                        </div>
                      ) : (
                        <DropSlot label={r.name} onFile={(f) => attachDoc(r.id, r.name, f)} text="Carregar" />
                      )}
                      <div className="rs-seg" role="group" aria-label={`Estado de ${r.name}`}>
                        {STATES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={entry?.state === s || (s === "confirmado" && entry?.state === "ficheiro")}
                            onClick={() => setDoc(r.id, entry?.state === s ? null : s)}
                          >
                            {s === "confirmado" ? "Ok" : s === "em_falta" ? "Em falta" : "N/A"}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Invoices */}
          <section className="rs-card" aria-labelledby="inv-h">
            <div className="rs-card-head">
              <h2 id="inv-h">Faturas</h2>
              <button type="button" className="rs-btn sm ml-auto" onClick={() => setInvoiceForm({})}>
                <IconPlus size={15} />
                Fatura
              </button>
            </div>
            <div className="rs-table-wrap">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fase</th>
                    <th>N.º</th>
                    <th>Emissão</th>
                    <th>Pagamento</th>
                    <th className="right">Valor s/IVA</th>
                    <th className="right">% manager</th>
                    <th className="right">Saldo</th>
                    <th>Estado</th>
                    <th>PDF</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="whitespace-nowrap">
                        {PHASE_LABEL[inv.phase]}
                        <span className="rs-sub">{monthName(inv.settlementMonth)}</span>
                        {inv.flag && <span className="rs-flag block">{inv.flag}</span>}
                      </td>
                      <td className="num">{inv.number || "—"}</td>
                      <td className="num">{date(inv.issuedAt)}</td>
                      <td className="num">{date(inv.paidAt)}</td>
                      <td className="right num">{money(inv.valueNoVat)}</td>
                      <td className="right num">
                        {percent(managerPct(inv, deal, db.dealTypes), 3)}
                        {inv.managerPctOverride != null && <span className="rs-sub">própria</span>}
                      </td>
                      <td className="right num font-semibold">{money(managerShare(inv, deal, db.dealTypes))}</td>
                      <td>
                        <InvoiceStatusPill status={inv.status} />
                      </td>
                      <td>
                        {inv.file ? (
                          <span className="rs-file-pair">
                            <FileThumb file={inv.file} label={`Fatura ${inv.number} · ${PHASE_LABEL[inv.phase]}`} set={files} />
                            <RemoveFile label={`PDF da fatura ${inv.number}`} onRemove={() => removeInvoiceFile(inv)} />
                          </span>
                        ) : (
                          <DropSlot label={`Fatura ${inv.number}`} onFile={(f) => attachInvoice(inv, f)} text="Anexar" />
                        )}
                      </td>
                      <td className="right">
                        <button type="button" className="rs-btn ghost sm" onClick={() => setInvoiceForm({ invoice: inv })}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && <div className="rs-empty">Ainda sem faturas. Adicione a primeira quando for emitida.</div>}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rs-card" aria-labelledby="ad-h">
            <div className="rs-card-head">
              <h2 id="ad-h">Anúncio</h2>
              {deal.listingShot && (
                <button type="button" className="rs-btn ghost sm ml-auto" onClick={() => dispatch({ type: "deal.shot", dealId: deal.id, file: null })}>
                  Remover
                </button>
              )}
            </div>
            <div className="rs-card-body">
              {deal.listingShot ? (
                <FileThumb file={deal.listingShot} label={`Anúncio · ${label}`} set={files} large />
              ) : (
                <DropSlot label="Captura do anúncio" onFile={attachShot} large />
              )}
              {deal.listingUrl ? (
                <a className="rs-link mt-3 flex items-center gap-1 truncate text-sm" href={deal.listingUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternal size={14} />
                  <span className="truncate">{deal.listingUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              ) : (
                <button type="button" className="rs-link mt-3 text-sm" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setEditing(true)}>
                  Adicionar link do anúncio
                </button>
              )}
            </div>
          </section>

          <section className="rs-card" aria-labelledby="com-h">
            <div className="rs-card-head">
              <h2 id="com-h">Comissão</h2>
            </div>
            <dl className="rs-card-body m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt style={{ color: "var(--muted)" }}>Tipo</dt>
              <dd className="m-0 text-right">
                {type?.name ?? "—"}
                <span className="rs-sub ml-auto">{type ? `${SIDES_LABEL[type.sides]} · ${percent(type.defaultManagerPct)}` : ""}</span>
              </dd>
              <dt style={{ color: "var(--muted)" }}>{type?.sides === "bank" ? "Consultor" : "Angariação"}</dt>
              <dd className="m-0 text-right">
                <PartyLabel db={db} party={deal.angariacao} />
              </dd>
              {type?.sides !== "bank" && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Compradores</dt>
                  <dd className="m-0 text-right">
                    <PartyLabel db={db} party={deal.compradores} />
                  </dd>
                </>
              )}
              <dt style={{ color: "var(--muted)" }}>Preço</dt>
              <dd className="num m-0 text-right">{money(deal.price)}</dd>
              <dt style={{ color: "var(--muted)" }}>% comissão</dt>
              <dd className="num m-0 text-right">{percent(deal.commissionPct)}</dd>
              {totalCommission != null && type?.sides !== "bank" && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Angariação ({deal.listingSplitPct}%)</dt>
                  <dd className="num m-0 text-right">{money((totalCommission * deal.listingSplitPct) / 100)}</dd>
                  <dt style={{ color: "var(--muted)" }}>Compradores ({100 - deal.listingSplitPct}%)</dt>
                  <dd className="num m-0 text-right">{money((totalCommission * (100 - deal.listingSplitPct)) / 100)}</dd>
                </>
              )}
              {totalCommission != null && type?.sides !== "bank" && teamFraction(deal) < 1 && (
                <>
                  <dt className="font-semibold">Para a equipa ({Math.round(teamFraction(deal) * 100)}%)</dt>
                  <dd className="num m-0 text-right font-semibold">{money(teamCommission(deal))}</dd>
                </>
              )}
              <dt className="border-t pt-2.5" style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
                Faturado s/IVA
              </dt>
              <dd className="num m-0 border-t pt-2.5 text-right" style={{ borderColor: "var(--line)" }}>
                {money(dealBilled(db, deal))}
              </dd>
              <dt className="font-semibold">Saldo do manager</dt>
              <dd className="num m-0 text-right text-base font-bold">{money(dealShare(db, deal))}</dd>
              {pending > 0 && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Dos quais por pagar</dt>
                  <dd className="num m-0 text-right" style={{ color: "var(--amber)" }}>
                    {money(pending)}
                  </dd>
                </>
              )}
            </dl>
            {deal.notes && (
              <p className="m-0 border-t px-[18px] py-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
                {deal.notes}
              </p>
            )}
          </section>
        </aside>
      </div>

      {editing && <DealForm deal={deal} onClose={() => setEditing(false)} />}
      {invoiceForm && (
        <InvoiceForm
          dealId={deal.id}
          invoice={invoiceForm.invoice}
          phase={invoiceForm.phase}
          value={invoiceForm.value}
          defaultPct={type?.defaultManagerPct ?? 0}
          onClose={() => setInvoiceForm(null)}
        />
      )}
    </>
  );
}

/** The two payment steps of a sale, CPCV and escritura, with what each should
 *  bring, what was invoiced and whether it was paid. A deal imported before
 *  this was asked shows the question first. */
function PhasesCard({
  db,
  deal,
  onEdit,
  onInvoice,
  onOpenInvoice,
}: {
  db: Db;
  deal: Deal;
  onEdit: () => void;
  onInvoice: (phase: InvoicePhase, value?: number) => void;
  onOpenInvoice: (inv: Invoice) => void;
}) {
  const { dispatch, notify } = useReorg();
  const phases = dealPhases(db, deal);
  const split = hasPhases(deal, db.dealTypes);
  const team = teamCommission(deal);
  const fraction = teamFraction(deal);
  const hadFirst = db.invoices.some((i) => i.dealId === deal.id && i.phase === "primeira");
  const hadTotal = db.invoices.some((i) => i.dealId === deal.id && i.phase === "total");

  async function answer(value: boolean) {
    const { documents, createdAt, ...rest } = deal;
    if ((await dispatch({ type: "deal.save", deal: { ...rest, cpcvSplit: value } })).ok)
      notify(value ? "Recebe 50% da comissão no CPCV." : "A comissão é toda recebida na escritura.");
  }

  return (
    <section className="rs-card scroll-mt-24" id="fases" aria-labelledby="ph-h">
      <div className="rs-card-head">
        <h2 id="ph-h">{split ? "Fases da comissão" : "Comissão"}</h2>
        <span className="aside num">
          {team != null ? `${money(team)} para a equipa${fraction < 1 ? ` · partilha ${Math.round(fraction * 100)}%` : ""}` : ""}
        </span>
      </div>
      <div className="rs-card-body flex flex-col gap-3">
        {split && deal.cpcvSplit == null && (
          <div className="rs-attn" role="group" aria-labelledby="cpcv-q">
            <div className="min-w-0 flex-1">
              <div id="cpcv-q" className="font-semibold">
                Recebe 50% da comissão no CPCV?
              </div>
              <div className="text-[12.5px]">
                Este negócio foi registado antes desta pergunta, por isso ainda não sabemos.
                {hadFirst
                  ? " Já tem uma fatura da 1.ª parte, o que indica que sim."
                  : hadTotal
                    ? " Tem uma fatura da comissão total, o que indica que foi tudo na escritura."
                    : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="rs-btn sm primary" onClick={() => answer(true)}>
                Sim, 50% no CPCV
              </button>
              <button type="button" className="rs-btn sm" onClick={() => answer(false)}>
                Não, tudo na escritura
              </button>
            </div>
          </div>
        )}
        {deal.commissionPct == null && deal.transaction !== "credito" && (
          <div className="rs-attn soft">
            <div className="min-w-0 flex-1 text-[12.5px]">Falta a % de comissão, por isso não dá para prever o valor de cada fase.</div>
            <button type="button" className="rs-btn sm" onClick={onEdit}>
              Indicar %
            </button>
          </div>
        )}
        <div className={`rs-phase-grid ${phases.length > 1 ? "two" : ""}`}>
          {phases.map((p, i) => (
            <PhaseTile key={p.key} phase={p} n={phases.length > 1 ? i + 1 : undefined} onInvoice={onInvoice} onOpenInvoice={onOpenInvoice} />
          ))}
        </div>
      </div>
    </section>
  );
}

const PHASE_SUB: Record<Phase["key"], string> = {
  cpcv: "Contrato-promessa de compra e venda",
  escritura: "Escritura de compra e venda",
  unica: "Pagamento único",
};

function PhaseTile({
  phase,
  n,
  onInvoice,
  onOpenInvoice,
}: {
  phase: Phase;
  n?: number;
  onInvoice: (phase: InvoicePhase, value?: number) => void;
  onOpenInvoice: (inv: Invoice) => void;
}) {
  const open = phase.state !== "nao_aplica";
  const left = phase.expected != null ? Math.max(0, phase.expected - phase.billed) : undefined;
  return (
    <div className={`rs-phase ${phase.state}`}>
      <div className="flex items-start gap-2.5">
        {n && (
          <span className="step num" aria-hidden="true">
            {n}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{phase.label}</div>
          <div className="text-[12px]" style={{ color: "var(--muted)" }}>
            {PHASE_SUB[phase.key]}
          </div>
        </div>
        <span className={`rs-pill ${phase.state === "paga" ? "jade" : phase.state === "por_pagar" || phase.state === "por_indicar" ? "amber" : ""}`}>
          {PHASE_STATE_LABEL[phase.state]}
        </span>
      </div>
      {phase.state === "nao_aplica" ? (
        <p className="m-0 mt-3 text-[12.5px]" style={{ color: "var(--muted)" }}>
          Este negócio não recebe nada no CPCV: a comissão é toda faturada na escritura.
        </p>
      ) : (
        <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt style={{ color: "var(--muted)" }}>Previsto</dt>
          <dd className="num m-0 text-right">{phase.expected != null ? money(phase.expected) : phase.state === "por_indicar" ? "50% se sim" : "—"}</dd>
          <dt style={{ color: "var(--muted)" }}>Faturado</dt>
          <dd className="num m-0 text-right font-semibold">{money(phase.billed)}</dd>
        </dl>
      )}
      {phase.invoices.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
          {phase.invoices.map((inv) => (
            <li key={inv.id}>
              <button type="button" className="rs-phase-inv" onClick={() => onOpenInvoice(inv)} aria-label={`Editar fatura ${inv.number || "sem número"}`}>
                <span className="num">N.º {inv.number || "—"}</span>
                <span className="num" style={{ color: "var(--muted)" }}>
                  {inv.paidAt ? `paga ${date(inv.paidAt)}` : monthName(inv.settlementMonth)}
                </span>
                <InvoiceStatusPill status={inv.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && phase.state !== "paga" && (left == null || left > 0.005) && (
        <button type="button" className="rs-btn sm mt-3" onClick={() => onInvoice(phase.invoicePhase, left)}>
          <IconPlus size={14} />
          Faturar {phase.key === "unica" ? "comissão" : phase.label}
        </button>
      )}
    </div>
  );
}
