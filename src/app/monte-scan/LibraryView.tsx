"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { docTypeMeta, formatBytes, type StoredDoc } from "./types";

export function LibraryView({
  docs,
  loading,
  onRefresh,
  onDeleted,
}: {
  docs: StoredDoc[];
  loading: boolean;
  onRefresh: () => void;
  onDeleted: (id: string) => void;
}) {
  const [origin, setOrigin] = useState("");
  const [shareFor, setShareFor] = useState<StoredDoc | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function del(doc: StoredDoc) {
    if (!confirm(`Delete "${doc.name}.pdf"? This cannot be undone.`)) return;
    const res = await fetch(`/api/monte-scan/documents/${doc.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDeleted(doc.id);
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading library…</p>;
  }

  if (!docs.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
        <p className="text-zinc-400">No documents yet</p>
        <p className="mt-1 text-sm text-zinc-600">
          Scanned PDFs you save will appear here.
        </p>
        <button
          onClick={onRefresh}
          className="mt-4 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {docs.length} document{docs.length === 1 ? "" : "s"} stored
        </p>
        <button
          onClick={onRefresh}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => {
          const meta = docTypeMeta(doc.docType);
          const url = `${origin}/api/monte-scan/documents/${doc.id}`;
          return (
            <motion.div
              key={doc.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {doc.name}.pdf
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {doc.label} · {doc.pages}p · {formatBytes(doc.size)}
                  </p>
                </div>
              </div>

              {doc.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {doc.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-xs text-zinc-300 hover:border-zinc-500"
                >
                  View
                </a>
                <button
                  onClick={() => setShareFor(doc)}
                  className="flex-1 rounded-lg bg-[#25D366]/15 px-3 py-1.5 text-center text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25"
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => del(doc)}
                  aria-label="Delete"
                  className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-500 hover:border-red-900 hover:text-red-400"
                >
                  🗑
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {shareFor && (
        <ShareModal
          doc={shareFor}
          url={`${origin}/api/monte-scan/documents/${shareFor.id}`}
          onClose={() => setShareFor(null)}
        />
      )}
    </>
  );
}

function ShareModal({
  doc,
  url,
  onClose,
}: {
  doc: StoredDoc;
  url: string;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const message = `${doc.label} — ${doc.name}.pdf\n${url}`;

  const digits = phone.replace(/[^\d]/g, "");
  const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  const isLocal = url.startsWith("http://localhost") || url.includes("127.0.0.1");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">Share on WhatsApp</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="mt-1 text-xs text-zinc-500">
          Opens WhatsApp with a prefilled message linking to the PDF. Leave the
          number blank to pick a contact in WhatsApp.
        </p>

        <label className="mt-4 block text-xs text-zinc-400">
          Recipient (with country code, optional)
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="351912345678"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-600"
        />

        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
          <p className="whitespace-pre-wrap break-all">{message}</p>
        </div>

        {isLocal && (
          <p className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300">
            This link points to localhost — the recipient won&apos;t be able to
            open it. Deploy to your VPS (public URL) for shareable links.
          </p>
        )}

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-lg bg-[#25D366] px-4 py-2.5 text-center text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Open WhatsApp
        </a>
      </motion.div>
    </div>
  );
}
