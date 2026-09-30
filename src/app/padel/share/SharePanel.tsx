"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePadel } from "../ui/PadelProvider";
import { IconCheck, IconClose, IconCopy, IconDownload, IconLink, IconShare } from "../ui/art";
import { IMAGE_WIDTH, paginate, revision, type SharePage } from "./paginate.ts";
import type { Tournament } from "../core/types.ts";

/* The sheet that turns a tournament into pictures ready for WhatsApp.

   The usual path is one tap: copy an image, switch to the chat, paste. The
   images themselves are drawn on the server, one PNG per address, so every
   action here works on the same file — copy it, share it, save it, or copy its
   address.

   Each image is fetched once when the sheet opens and kept as a blob. The
   thumbnail, the clipboard, the share sheet and the download all use that one
   copy, so a tap on "Copy" is instant instead of waiting on a download, and it
   still happens inside the tap, which is what browsers require before they let a
   page touch the clipboard.

   A big tournament is several images, and the clipboard holds one image at a
   time. So the panel does not pretend otherwise: each image has its own button,
   marks itself done once copied, and where the phone allows it there is also a
   "share all" that hands every image to WhatsApp in one go. */

type Status = "idle" | "busy" | "copied" | "saved" | "failed";

interface Loaded {
  url: string;
  blob: Blob;
}

export function SharePanel({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { t, lang } = usePadel();
  const pages = useMemo(() => paginate(tournament), [tournament]);
  const rev = revision(tournament);
  const hasMatches = pages.some((p) => p.blocks.length > 0);
  const moreToCome =
    tournament.format === "mexicano" && tournament.status === "active";

  const [images, setImages] = useState<Record<number, Loaded | "error">>({});
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const path = useCallback(
    (n: number, withRevision: boolean) =>
      `/api/padel/share/${tournament.id}/${n}.png?lang=${lang}` + (withRevision ? `&v=${rev}` : ""),
    [tournament.id, lang, rev],
  );

  // Fetch every image once, and again if the tournament or language changes.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setImages({});

    pages.forEach(async (page) => {
      try {
        const res = await fetch(path(page.number, true), { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urls.push(url);
        if (!cancelled) setImages((prev) => ({ ...prev, [page.number]: { url, blob } }));
      } catch {
        if (!cancelled) setImages((prev) => ({ ...prev, [page.number]: "error" }));
      }
    });

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pages, path]);

  // Can this device hand files to another app? Phones can; most desktops cannot.
  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "a.png", { type: "image/png" });
      setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  const say = useCallback((text: string, ok = true) => {
    setNotice({ text, ok });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const mark = (n: number, s: Status) => setStatus((prev) => ({ ...prev, [n]: s }));

  /** The image as a blob: the copy we already have, or a fresh fetch. */
  const blobFor = useCallback(
    (n: number): Promise<Blob> => {
      const have = images[n];
      if (have && have !== "error") return Promise.resolve(have.blob);
      return fetch(path(n, true), { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      });
    },
    [images, path],
  );

  const save = useCallback(
    async (n: number) => {
      const blob = await blobFor(n);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `padel-jogos-${n}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    [blobFor],
  );

  const copyImage = useCallback(
    async (n: number) => {
      mark(n, "busy");
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          // The blob goes in as a promise: the write starts inside the tap, and
          // the browser waits for the picture, which keeps Safari happy too.
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blobFor(n) })]);
          mark(n, "copied");
          say(t("share.copied"));
        } else {
          await save(n);
          mark(n, "saved");
          say(t("share.saved"));
        }
      } catch {
        mark(n, "failed");
        say(t("share.failed"), false);
      }
    },
    [blobFor, save, say, t],
  );

  const shareFiles = useCallback(
    async (numbers: number[]) => {
      try {
        const files = await Promise.all(
          numbers.map(async (n) => new File([await blobFor(n)], `padel-jogos-${n}.png`, { type: "image/png" })),
        );
        await navigator.share({ files, title: tournament.name });
      } catch (error) {
        // Closing the share sheet is not a failure.
        if ((error as Error)?.name !== "AbortError") say(t("share.failed"), false);
      }
    },
    [blobFor, say, t, tournament.name],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + path(1, false));
      say(t("share.linkCopied"));
    } catch {
      say(t("share.failed"), false);
    }
  }, [path, say, t]);

  // Escape closes; Tab stays inside; the page behind does not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("[data-first]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheet.current) return;
      const focusable = [...sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const ready = pages.every((p) => images[p.number] && images[p.number] !== "error");

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <div className="pd-scrim absolute inset-0 bg-black/65" onClick={onClose} aria-hidden="true" />

      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="pd-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-3xl border-t border-zinc-800 bg-zinc-900 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
          <h2 id="share-title" className="text-lg font-bold">
            {t("share.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("share.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 active:bg-zinc-800"
          >
            <IconClose size={22} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
          <p className="mb-4 text-sm leading-relaxed text-zinc-400">{t("share.hint")}</p>

          {!hasMatches ? (
            <p className="py-10 text-center text-zinc-500">{t("share.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {pages.map((page, i) => (
                <ImageCard
                  key={page.number}
                  page={page}
                  entry={images[page.number]}
                  status={status[page.number] ?? "idle"}
                  canShare={canShareFiles}
                  first={i === 0}
                  onCopy={() => copyImage(page.number)}
                  onShare={() => shareFiles([page.number])}
                  onSave={() => save(page.number).catch(() => say(t("share.failed"), false))}
                  onLink={copyLink}
                />
              ))}
            </ul>
          )}

          {hasMatches && canShareFiles && pages.length > 1 && (
            <button
              type="button"
              disabled={!ready}
              onClick={() => shareFiles(pages.map((p) => p.number))}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-lime-300/40 text-base font-semibold text-lime-300 active:bg-lime-300/10 disabled:opacity-40"
            >
              <IconShare size={20} />
              {t("share.shareAll")}
            </button>
          )}

          {moreToCome && <p className="mt-4 text-center text-sm text-zinc-500">{t("share.more")}</p>}
        </div>

        {/* What just happened, said aloud to screen readers and shown briefly. */}
        <div role="status" aria-live="polite" className="pointer-events-none min-h-0">
          {notice && (
            <p
              className={`mx-4 mb-4 rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                notice.ok ? "bg-lime-300 text-zinc-950" : "bg-red-500/20 text-red-200"
              }`}
            >
              {notice.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageCard({
  page,
  entry,
  status,
  canShare,
  first,
  onCopy,
  onShare,
  onSave,
  onLink,
}: {
  page: SharePage;
  entry: Loaded | "error" | undefined;
  status: Status;
  canShare: boolean;
  first: boolean;
  onCopy: () => void;
  onShare: () => void;
  onSave: () => void;
  onLink: () => void;
}) {
  const { t } = usePadel();
  const done = status === "copied" || status === "saved";
  const label =
    page.fromRound === page.toRound
      ? t("share.round", { n: page.fromRound })
      : t("share.rounds", { from: page.fromRound, to: page.toRound });

  const secondary =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-800 px-2 text-sm font-semibold text-zinc-200 active:bg-zinc-700";

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex gap-3">
        <div
          className="w-[104px] shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800"
          style={{ aspectRatio: `${IMAGE_WIDTH} / ${page.height}` }}
        >
          {entry && entry !== "error" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.url} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : entry === "error" ? (
            <span className="flex h-full items-center justify-center p-2 text-center text-xs text-zinc-500">
              {t("share.failed")}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-bold leading-tight">{t("share.imageOf", { n: page.number, total: page.total })}</p>
          <p className="text-sm text-zinc-400">{label}</p>
          <button
            type="button"
            data-first={first ? "" : undefined}
            onClick={onCopy}
            disabled={status === "busy" || entry === "error"}
            className={`mt-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors ${
              done ? "bg-zinc-800 text-lime-300" : "bg-lime-300 text-zinc-950 active:bg-lime-400"
            } disabled:opacity-50`}
          >
            {done ? <IconCheck size={20} /> : <IconCopy size={20} />}
            {status === "busy" ? t("share.copying") : done ? t("share.done") : t("share.copy")}
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        {canShare && (
          <button type="button" onClick={onShare} className={secondary}>
            <IconShare size={17} />
            {t("share.shareOne")}
          </button>
        )}
        <button type="button" onClick={onSave} className={secondary}>
          <IconDownload size={17} />
          {t("share.save")}
        </button>
        <button type="button" onClick={onLink} className={secondary}>
          <IconLink size={17} />
          {t("share.copyLink")}
        </button>
      </div>
    </li>
  );
}
