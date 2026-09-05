"use client";

/* Share a result as a card. The image is generated server-side from the same
   inputs the page used (see api/lfp/og), and the link carries those inputs
   so the page it opens unfurls the same card. Native share where the
   platform has it, copy-link everywhere. */

import { useEffect, useState } from "react";
import { useLfpLang } from "../useLfpLang";

export function ShareCard({
  card,
  params,
  pagePath,
  title,
}: {
  card: "salario" | "inflacao" | "dias" | "quiz";
  params: Record<string, string | number>;
  pagePath: string;
  /** One-line summary used as the share title and the image alt. */
  title: string;
}) {
  const { t, lang } = useLfpLang();
  const s = t.chrome.share;
  const [origin, setOrigin] = useState("");
  const [canNative, setCanNative] = useState(false);
  const [copied, setCopied] = useState(false);

  // Both are browser facts; read after mount so the server render matches.
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  const imageUrl = `/api/lfp/og/${card}?${qs}&lang=${lang}`;
  const shareUrl = `${origin}${pagePath}?${qs}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the URL is visible below to select by hand */
    }
  };

  const native = async () => {
    try {
      await navigator.share({ title, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <section className="lfp-panel overflow-hidden" aria-labelledby={`lfp-share-${card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lfp-line)] px-5 py-3">
        <h2 id={`lfp-share-${card}`} className="text-sm font-semibold">
          {s.title}
        </h2>
        <span className="text-xs text-[var(--lfp-mist)]">{s.hint}</span>
      </div>
      <div className="p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${s.alt}: ${title}`}
          width={1200}
          height={630}
          loading="lazy"
          className="w-full rounded-lg border border-[var(--lfp-line)]"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="lfp-focus lfp-press min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-4 text-sm font-semibold text-[var(--lfp-cal-tile)]"
          >
            {copied ? s.copied : s.copy}
          </button>
          {canNative && (
            <button
              type="button"
              onClick={native}
              className="lfp-focus lfp-press min-h-11 rounded-lg border border-[var(--lfp-line)] px-4 text-sm hover:border-[var(--lfp-cobalt)]"
            >
              {s.native}
            </button>
          )}
          <span
            aria-live="polite"
            className="lfp-num min-w-0 flex-1 truncate text-xs text-[var(--lfp-mist)]"
            title={shareUrl}
          >
            {shareUrl || pagePath}
          </span>
        </div>
      </div>
    </section>
  );
}
