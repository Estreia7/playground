"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileRef } from "../../core/types.ts";
import { IconChevronLeft, IconChevronRight, IconClose, IconDownload, IconFile, IconTrash, IconUpload } from "../Icons.tsx";
import { namePasted } from "./prepare.ts";

/* One family of pieces for every file in ReorgSI — listing screenshots,
   deal documents, invoices, payout receipts:

   FileThumb   a small preview; hover or focus shows it larger, click opens
               the lightbox on the whole set it belongs to
   Lightbox    full-screen viewer, ←/→ through the set, images inline and
               PDFs in the browser's own viewer
   DropSlot    an empty place for a file: click to choose, drop a file on it,
               or paste a screenshot with Ctrl+V while hovering or focused
   RemoveFile  takes a wrong file off again: the bin asks "Remover?" first,
               and a second click within a few seconds removes it */

export const fileUrl = (f: FileRef, download = false) => `/api/reorgsi/files/${f.id}${download ? "?download" : ""}`;
/** Portals render inside the .rs root so they keep its font and tokens. */
const portalRoot = () => document.querySelector(".rs") ?? document.body;
const isImage = (f: FileRef) => f.mime.startsWith("image/");

export function kb(size: number): string {
  return size > 1024 * 1024 ? (size / 1024 / 1024).toFixed(1).replace(".", ",") + " MB" : Math.round(size / 1024) + " KB";
}

export interface LabelledFile {
  file: FileRef;
  label: string;
}

type Open = (items: LabelledFile[], index: number) => void;
const LightboxContext = createContext<Open>(() => undefined);

/** Opens the full-screen viewer on a set of files. */
export const useLightbox = () => useContext(LightboxContext);

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ items: LabelledFile[]; index: number } | null>(null);
  const open = useCallback<Open>((items, index) => setState({ items, index }), []);
  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state && (
        <Lightbox
          items={state.items}
          index={state.index}
          onIndex={(index) => setState((s) => (s ? { ...s, index } : s))}
          onClose={() => setState(null)}
        />
      )}
    </LightboxContext.Provider>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LabelledFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = items[index];
  const many = items.length > 1;

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
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) onIndex((index + 1) % items.length);
      else if (e.key === "ArrowLeft" && many) onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, many, onClose, onIndex]);

  if (!current) return null;

  return createPortal(
    <div className="rs-lightbox" role="dialog" aria-modal="true" aria-label={current.label} onClick={onClose}>
      <header onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="name font-semibold">{current.label}</div>
          <div className="name text-xs" style={{ color: "#9fc0b9" }}>
            {current.file.name} · {kb(current.file.size)}
            {many && ` · ${index + 1} de ${items.length}`}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {many && (
            <>
              <button type="button" className="rs-btn sm" onClick={() => onIndex((index - 1 + items.length) % items.length)} aria-label="Anterior">
                <IconChevronLeft size={16} />
              </button>
              <button type="button" className="rs-btn sm" onClick={() => onIndex((index + 1) % items.length)} aria-label="Seguinte">
                <IconChevronRight size={16} />
              </button>
            </>
          )}
          <a className="rs-btn sm" href={fileUrl(current.file, true)} download={current.file.name}>
            <IconDownload size={16} />
            <span className="hidden sm:inline">Descarregar</span>
          </a>
          <button ref={closeRef} type="button" className="rs-btn sm" onClick={onClose} aria-label="Fechar">
            <IconClose size={16} />
          </button>
        </div>
      </header>
      <div className="stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {isImage(current.file) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(current.file)} alt={current.label} onClick={(e) => e.stopPropagation()} />
        ) : (
          <iframe src={fileUrl(current.file)} title={current.label} onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    </div>,
    portalRoot(),
  );
}

/** A small preview. `set` is everything it should page through in the lightbox. */
export function FileThumb({
  file,
  label,
  set,
  large = false,
}: {
  file: FileRef;
  label: string;
  set?: LabelledFile[];
  large?: boolean;
}) {
  const open = useContext(LightboxContext);
  const ref = useRef<HTMLButtonElement>(null);
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null);
  const items = set && set.some((s) => s.file.id === file.id) ? set : [{ file, label }];
  const index = Math.max(0, items.findIndex((s) => s.file.id === file.id));

  const show = () => {
    if (large) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const W = 320;
    const x = Math.min(window.innerWidth - W - 12, Math.max(12, r.left + r.width / 2 - W / 2));
    const below = r.bottom + 8;
    const y = below + 300 > window.innerHeight ? Math.max(12, r.top - 308) : below;
    setPop({ x, y });
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`rs-thumb ${large ? "lg" : ""}`}
        style={isImage(file) ? { backgroundImage: `url(${fileUrl(file)})` } : undefined}
        onClick={() => {
          setPop(null);
          open(items, index);
        }}
        onMouseEnter={show}
        onMouseLeave={() => setPop(null)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()}
        onBlur={() => setPop(null)}
        aria-label={`Ver ${label}`}
        title={label}
      >
        {!isImage(file) && (
          <span className="flex flex-col items-center">
            <IconFile size={large ? 32 : 15} />
            <span className="tag">PDF</span>
          </span>
        )}
      </button>
      {pop &&
        createPortal(
          <div className="rs-pop" style={{ left: pop.x, top: pop.y }} aria-hidden="true">
            {isImage(file) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(file)} alt="" />
            ) : (
              <div className="flex items-center gap-3 p-3" style={{ color: "var(--teal)" }}>
                <IconFile size={34} />
                <div className="min-w-0 text-sm" style={{ color: "var(--ink)" }}>
                  <div className="truncate font-semibold">{file.name}</div>
                  <div style={{ color: "var(--muted)" }}>PDF · {kb(file.size)} · clique para abrir</div>
                </div>
              </div>
            )}
            <div className="cap">{label}</div>
          </div>,
          portalRoot(),
        )}
    </>
  );
}

/** An empty place for a file. Calls `onFile` with what the person chose,
 *  dropped or pasted; the caller uploads it and attaches it. */
export function DropSlot({
  label,
  onFile,
  accept = "application/pdf,image/jpeg,image/png,image/webp",
  large = false,
  text,
}: {
  label: string;
  onFile: (file: File) => Promise<void> | void;
  accept?: string;
  large?: boolean;
  text?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hovered = useRef(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = useCallback(
    async (file: File | undefined | null) => {
      if (!file || busy) return;
      setBusy(true);
      try {
        await onFile(file);
      } finally {
        setBusy(false);
      }
    },
    [busy, onFile],
  );

  // Ctrl+V lands on the slot under the pointer, or the one with focus.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!hovered.current && document.activeElement !== button.current) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void take(namePasted(file, label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [label, take]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`rs-drop ${large ? "lg" : ""}`}
        data-over={over}
        disabled={busy}
        onClick={() => input.current?.click()}
        onMouseEnter={() => (hovered.current = true)}
        onMouseLeave={() => (hovered.current = false)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        aria-label={`Adicionar ${label}: escolher, largar ou colar ficheiro`}
        title="Clique, largue um ficheiro ou cole com Ctrl+V"
      >
        <IconUpload size={large ? 22 : 14} />
        {busy ? "A enviar…" : (text ?? (large ? `Adicionar ${label.toLowerCase()}` : "Adicionar"))}
        {large && !busy && <span className="hint">Clique, largue aqui ou cole com Ctrl+V</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** The bin next to a file. One click arms it, a second removes; it disarms
 *  on its own after a few seconds or when focus leaves. */
export function RemoveFile({ label, onRemove }: { label: string; onRemove: () => void | Promise<unknown> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`rs-remove ${armed ? "armed" : ""}`}
      disabled={busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onRemove();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Confirmar: remover ${label}` : `Remover ${label}`}
      title={armed ? "Clique outra vez para remover" : `Remover ${label}`}
    >
      <IconTrash size={15} />
      {armed && <span>Remover?</span>}
    </button>
  );
}
