"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Deal, DocRequirement, FileRef } from "../../core/types.ts";
import { docProgress, requirementsFor } from "../../core/commission.ts";
import { useReorg } from "../App.tsx";
import { DocRing } from "../parts.tsx";
import { date } from "../format.ts";
import { IconCheckCircle, IconClose, IconCloudUpload, IconDownload, IconEye, IconFile, IconScan, IconTrash, IconUpload } from "../Icons.tsx";
import { Scanner } from "../scan/Scanner.tsx";
import { fileUrl, kb, useLightbox, type LabelledFile } from "./Files.tsx";
import { namePasted } from "./prepare.ts";

/* The documents of one deal, in a window: what its type asks for (set in
   Configuração › Documentos), each with its own upload, and a large drop zone
   that fills the next one still missing. Every upload shows its progress,
   then "Carregado", a green tick and when it went in. */

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const ACCEPTED = new Set(ACCEPT.split(","));
const MAX_BYTES = 15 * 1024 * 1024;
const MIN_UPLOAD_MS = 900; // even a tiny file shows the bar filling, so the change is seen

const portalRoot = () => document.querySelector(".rs") ?? document.body;

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return date(iso);
  return `${date(iso)} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Progress = Record<string, { fraction: number; name: string }>;

export function DocsDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { db, dispatch, upload, notify } = useReorg();
  const openViewer = useLightbox();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [scanning, setScanning] = useState<DocRequirement | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickFor = useRef<DocRequirement | null>(null);

  const reqs = requirementsFor(deal, db.docRequirements).sort((a, b) => Number(b.required) - Number(a.required));
  const p = docProgress(deal, db.docRequirements);
  const label = deal.ref || deal.address;
  const nextMissing = reqs.find((r) => !progress[r.id] && !["ficheiro", "na"].includes(deal.documents[r.id]?.state ?? ""));

  const filed: LabelledFile[] = reqs.flatMap((r) => {
    const f = deal.documents[r.id]?.file;
    return f ? [{ file: f, label: `${r.name} · ${label}` }] : [];
  });

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      returnTo?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The viewer sits on top and handles its own Escape.
      if (e.key === "Escape" && !document.querySelector(".rs-lightbox, .rs-scanner")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(r: DocRequirement, file: File) {
    // Rules before anything is sent: PDF or image, not empty, within the limit.
    // Photos are made smaller before upload, so only a PDF can be too big.
    if (!ACCEPTED.has(file.type)) return notify(`${file.name}: use PDF, JPG, PNG ou WebP.`, true);
    if (file.size === 0) return notify(`${file.name} está vazio.`, true);
    if (file.type === "application/pdf" && file.size > MAX_BYTES) return notify(`${file.name} tem mais de 15 MB.`, true);
    const started = performance.now();
    setProgress((s) => ({ ...s, [r.id]: { fraction: 0, name: file.name } }));
    const ref = await upload(file, (fraction) =>
      setProgress((s) => (s[r.id] ? { ...s, [r.id]: { ...s[r.id], fraction: Math.min(0.92, fraction) } } : s)),
    );
    if (ref) {
      setProgress((s) => ({ ...s, [r.id]: { ...s[r.id], fraction: 1 } }));
      await new Promise((ok) => setTimeout(ok, Math.max(250, MIN_UPLOAD_MS - (performance.now() - started))));
      const saved = await dispatch({ type: "deal.doc", dealId: deal.id, reqId: r.id, entry: { state: "ficheiro", file: ref } });
      if (saved.ok) notify(`${r.name} carregado.`);
    }
    setProgress((s) => {
      const next = { ...s };
      delete next[r.id];
      return next;
    });
  }

  async function remove(r: DocRequirement) {
    setConfirming(null);
    const res = await dispatch({ type: "deal.doc", dealId: deal.id, reqId: r.id, entry: null });
    if (res.ok) notify(`${r.name} eliminado.`);
  }

  function choose(r: DocRequirement) {
    pickFor.current = r;
    picker.current?.click();
  }

  function dropBig(file: File | null | undefined) {
    if (!file) return;
    if (!nextMissing) return notify("Todos os documentos já têm ficheiro. Substitua um na lista.", true);
    void send(nextMissing, file);
  }

  // Ctrl+V anywhere in the window fills the next missing document.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file")?.getAsFile();
      if (!file || !nextMissing || document.querySelector(".rs-scanner")) return;
      e.preventDefault();
      void send(nextMissing, namePasted(file, nextMissing.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return createPortal(
    <div className="rs-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-modal rs-docs" role="dialog" aria-modal="true" aria-labelledby="docs-title">
        <header>
          <DocRing db={db} deal={deal} compact />
          <div className="min-w-0">
            <h2 id="docs-title">Documentos · {label}</h2>
            <p>
              {db.dealTypes.find((t) => t.id === deal.dealTypeId)?.name ?? "Sem tipo"} · {p.done} de {p.total} obrigatórios carregados
            </p>
          </div>
          <button ref={closeRef} type="button" className="rs-btn ghost sm ml-auto" onClick={onClose} aria-label="Fechar">
            <IconClose size={18} />
          </button>
        </header>

        <button
          type="button"
          className="rs-bigdrop"
          data-over={over}
          disabled={!nextMissing}
          onClick={() => nextMissing && choose(nextMissing)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            dropBig(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="orb" aria-hidden="true">
            <IconCloudUpload size={26} />
          </span>
          <strong>{nextMissing ? `Largue aqui: ${nextMissing.name}` : "Todos os documentos têm ficheiro"}</strong>
          <span className="hint">
            {nextMissing ? "Ou clique para escolher, ou cole com Ctrl+V. PDF, JPG, PNG ou WebP até 15 MB." : "Para substituir um, use o botão na linha do documento."}
          </span>
        </button>

        {nextMissing && (
          <button type="button" className="rs-btn rs-scanbtn" onClick={() => setScanning(nextMissing)}>
            <IconScan size={18} />
            Digitalizar {nextMissing.name} com a câmara
            <span className="hint">várias páginas num só PDF</span>
          </button>
        )}

        <ul className="rs-doclist">
          {reqs.map((r) => {
            const entry = deal.documents[r.id];
            const busy = progress[r.id];
            const file: FileRef | undefined = entry?.file;
            return (
              <li key={r.id} className={busy ? "busy" : file ? "done" : ""}>
                <span className="tile" aria-hidden="true">
                  {file && !busy ? <IconCheckCircle size={22} /> : <IconFile size={20} />}
                </span>
                <div className="body">
                  <div className="title">
                    {r.name}
                    {!r.required && <span className="opt">Opcional</span>}
                  </div>
                  {busy ? (
                    <>
                      <div className="meta" aria-live="polite">
                        A carregar {busy.name} · {Math.round(busy.fraction * 100)}%
                      </div>
                      <div className="bar" role="progressbar" aria-valuenow={Math.round(busy.fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`A carregar ${r.name}`}>
                        <span style={{ width: `${Math.max(6, busy.fraction * 100)}%` }} />
                      </div>
                    </>
                  ) : file ? (
                    <div className="meta">
                      <span className="ok">Carregado</span> · {when(file.uploadedAt)} · {file.name} · {kb(file.size)}
                    </div>
                  ) : (
                    <div className="meta">
                      {entry?.state === "confirmado"
                        ? "Marcado Ok, sem ficheiro"
                        : entry?.state === "em_falta"
                          ? <span className="missing">Em falta</span>
                          : entry?.state === "na"
                            ? "Não aplicável"
                            : "Por carregar"}
                    </div>
                  )}
                </div>
                <div className="actions">
                  {busy ? null : file ? (
                    confirming === r.id ? (
                      <>
                        <span className="ask">Eliminar?</span>
                        <button type="button" className="rs-btn sm danger" onClick={() => remove(r)}>
                          Eliminar
                        </button>
                        <button type="button" className="rs-btn sm ghost" onClick={() => setConfirming(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rs-iconbtn"
                          onClick={() => openViewer(filed, Math.max(0, filed.findIndex((x) => x.file.id === file.id)))}
                          aria-label={`Pré-visualizar ${r.name}`}
                          title="Pré-visualizar"
                        >
                          <IconEye size={17} />
                        </button>
                        <a className="rs-iconbtn" href={fileUrl(file, true)} download={file.name} aria-label={`Descarregar ${r.name}`} title="Descarregar">
                          <IconDownload size={17} />
                        </a>
                        <button type="button" className="rs-iconbtn" onClick={() => setScanning(r)} aria-label={`Digitalizar de novo ${r.name}`} title="Digitalizar de novo">
                          <IconScan size={17} />
                        </button>
                        <button type="button" className="rs-iconbtn" onClick={() => choose(r)} aria-label={`Substituir ${r.name}`} title="Substituir">
                          <IconUpload size={17} />
                        </button>
                        <button type="button" className="rs-iconbtn danger" onClick={() => setConfirming(r.id)} aria-label={`Eliminar ${r.name}`} title="Eliminar">
                          <IconTrash size={17} />
                        </button>
                      </>
                    )
                  ) : (
                    <>
                      <button type="button" className="rs-iconbtn" onClick={() => setScanning(r)} aria-label={`Digitalizar ${r.name}`} title="Digitalizar com a câmara">
                        <IconScan size={17} />
                      </button>
                      <button type="button" className="rs-btn sm" onClick={() => choose(r)}>
                        <IconUpload size={15} />
                        Carregar
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {reqs.length === 0 && <li className="empty">Este tipo de negócio não pede documentos. Configure-os em Configuração › Documentos.</li>}
        </ul>

        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            const r = pickFor.current;
            e.target.value = "";
            if (file && r) void send(r, file);
          }}
        />
      </div>
      {scanning && (
        <Scanner
          title={`${scanning.name} · ${label}`}
          maxBytes={MAX_BYTES}
          onClose={() => setScanning(null)}
          onDone={(file) => {
            const r = scanning;
            setScanning(null);
            void send(r, file);
          }}
        />
      )}
    </div>,
    portalRoot(),
  );
}
