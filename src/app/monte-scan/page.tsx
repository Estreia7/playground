"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ScanView } from "./ScanView";
import { LibraryView } from "./LibraryView";
import type { StoredDoc } from "./types";

type Tab = "scan" | "library";

export default function MonteScanPage() {
  const [tab, setTab] = useState<Tab>("scan");
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/monte-scan/documents");
      const json = await res.json();
      setDocs(json.documents ?? []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved(doc: StoredDoc) {
    setDocs((prev) => [doc, ...prev]);
    setTab("library");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
              ← Playground
            </Link>
            <span className="text-zinc-700">/</span>
            <h1 className="font-semibold tracking-tight">Monte Scan</h1>
            <span className="rounded-full bg-orange-600/20 px-2 py-0.5 text-xs text-orange-400">
              live
            </span>
          </div>

          <nav className="flex items-center gap-1 rounded-lg border border-zinc-800 p-1">
            {(["scan", "library"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === "library") load();
                  setTab(t);
                }}
                className="relative rounded-md px-3 py-1.5 text-sm capitalize"
              >
                {tab === t && (
                  <motion.span
                    layoutId="ms-tab"
                    className="absolute inset-0 rounded-md bg-zinc-800"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span
                  className={`relative z-10 ${
                    tab === t ? "text-white" : "text-zinc-500"
                  }`}
                >
                  {t}
                  {t === "library" && docs.length > 0 && (
                    <span className="ml-1.5 text-xs text-zinc-500">
                      {docs.length}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {tab === "scan" ? (
          <ScanView onSaved={handleSaved} />
        ) : (
          <LibraryView
            docs={docs}
            loading={loading}
            onRefresh={load}
            onDeleted={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
          />
        )}
      </main>
    </div>
  );
}
