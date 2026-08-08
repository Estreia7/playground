"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useHostState } from "./useHostState";
import { NewTargetForm, TasksList } from "./TasksView";
import { HostView } from "./HostView";
import { FunnelView } from "./FunnelView";

type Tab = "dossiers" | "funnel";

export default function HostAnalyzerPage() {
  const {
    visibleJobs,
    selected,
    setSelected,
    currentJob,
    funnel,
    refreshFunnel,
    submitJob,
    cancelJob,
    deleteJob,
    retryJob,
    runAdr,
  } = useHostState();
  const [tab, setTab] = useState<Tab>("dossiers");

  async function handleSubmit(input: { profileUrl: string; name: string }) {
    const id = await submitJob(input);
    setSelected(id);
    setTab("dossiers");
    return id;
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tide)] py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="ha-focus rounded-md text-xs text-[var(--mist)] transition-colors hover:text-[var(--foam)]"
          >
            ← Playground
          </Link>
          <div>
            <h1 className="ha-display text-lg font-extrabold tracking-tight">
              Host<span className="text-[var(--verdi)]">Analyzer</span>
            </h1>
            <p className="text-[11px] text-[var(--mist)]">
              Airbnb host intelligence · Alojamento Local registry
            </p>
          </div>
        </div>

        <nav className="flex rounded-[12px] border border-[var(--tide)] bg-[var(--harbor)] p-1" aria-label="Views">
          {(
            [
              ["dossiers", "Dossiers"],
              ["funnel", "Funnel"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                if (key === "funnel") refreshFunnel();
              }}
              aria-current={tab === key ? "page" : undefined}
              className={`ha-focus relative rounded-[9px] px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? "text-[var(--ink-deep)]" : "text-[var(--mist)] hover:text-[var(--foam)]"
              }`}
            >
              {tab === key && (
                <motion.span
                  layoutId="ha-tab-pill"
                  className="absolute inset-0 rounded-[9px] bg-[var(--verdi)]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  aria-hidden
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 py-5">
        <AnimatePresence mode="wait">
          {tab === "dossiers" ? (
            <motion.div
              key="dossiers"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-5 lg:grid-cols-[320px_1fr]"
            >
              <aside className="flex flex-col gap-4 lg:sticky lg:top-5 lg:self-start">
                <NewTargetForm onSubmit={handleSubmit} />
                <TasksList jobs={visibleJobs} selected={selected} onSelect={setSelected} />
              </aside>

              <section className="min-w-0">
                {currentJob ? (
                  <HostView
                    job={currentJob}
                    funnel={funnel}
                    onRunAdr={() => runAdr(currentJob.id)}
                    onCancel={() => cancelJob(currentJob.id)}
                    onDelete={() => deleteJob(currentJob.id)}
                    onRetry={() => retryJob(currentJob.id)}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ha-panel flex min-h-[420px] flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="ha-sonar relative h-3 w-3 rounded-full bg-[var(--verdi)] text-[var(--verdi)]" aria-hidden />
                    <h2 className="ha-display mt-6 text-lg font-semibold">No target selected</h2>
                    <p className="mt-2 max-w-sm text-sm text-[var(--mist)]">
                      Paste an Airbnb host profile URL to build a dossier: listings, AL licenses,
                      registry owners, insurance status, operating area and rates.
                    </p>
                  </motion.div>
                )}
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="funnel"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <FunnelView
                funnel={funnel}
                onOpenHost={(id) => {
                  setSelected(id);
                  setTab("dossiers");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-[var(--tide)] py-3 text-center text-[10px] text-[var(--mist)]/70">
        Registry data: RNT, Turismo de Portugal. Map: OpenStreetMap contributors.
      </footer>
    </div>
  );
}
