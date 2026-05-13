"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { NewTaskView } from "./NewTaskView";
import { TasksView } from "./TasksView";
import { MonitorView } from "./MonitorView";
import { useScrapperState } from "./useScrapperState";

type View = "new" | "tasks" | "monitor" | "settings";

export default function ScrapperPage() {
  const state = useScrapperState();
  const [view, setView] = useState<View>("new");

  async function handleSubmitted(jobId: string) {
    state.setSelected(jobId);
    setView("tasks");
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this task?")) return;
    await state.cancelJob(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task from history? Cached listing results stay.")) return;
    await state.deleteJob(id);
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Rail
        view={view}
        onChange={setView}
        tasksCount={state.visibleJobs.length}
        activeCount={state.activeCount}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
                ← Playground
              </Link>
              <span className="text-zinc-700">/</span>
              <h1 className="font-semibold tracking-tight">Airbnb STR Scrapper</h1>
              <span className="rounded-full bg-orange-600/20 px-2 py-0.5 text-xs text-orange-400">live</span>
            </div>
            <ViewBadge view={view} />
          </div>
        </header>

        <main className="flex-1 px-6 py-6">
          {view === "new" && (
            <NewTaskView onSubmit={state.submitJob} onSubmitted={handleSubmitted} />
          )}
          {view === "tasks" && (
            <TasksView
              jobs={state.visibleJobs}
              selected={state.selected}
              onSelect={state.setSelected}
              current={state.currentJob}
              onCancel={handleCancel}
              onDelete={handleDelete}
              onNewTask={() => setView("new")}
            />
          )}
          {view === "monitor" && (
            <MonitorView
              jobs={state.visibleJobs}
              selected={state.selected}
              onSelect={state.setSelected}
              current={state.currentJob}
            />
          )}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

function ViewBadge({ view }: { view: View }) {
  const label =
    view === "new"
      ? "New task"
      : view === "tasks"
      ? "Tasks"
      : view === "monitor"
      ? "Monitor"
      : "Settings";
  return <span className="text-xs text-zinc-500">{label}</span>;
}

function Rail({
  view,
  onChange,
  tasksCount,
  activeCount,
}: {
  view: View;
  onChange: (v: View) => void;
  tasksCount: number;
  activeCount: number;
}) {
  return (
    <nav className="flex w-16 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 py-4">
      <RailButton label="New task" active={view === "new"} onClick={() => onChange("new")}>
        <PlusIcon />
      </RailButton>
      <RailButton
        label={`Tasks (${tasksCount})`}
        active={view === "tasks"}
        onClick={() => onChange("tasks")}
        badge={activeCount > 0 ? activeCount : undefined}
      >
        <ListIcon />
      </RailButton>
      <RailButton label="Monitor" active={view === "monitor"} onClick={() => onChange("monitor")}>
        <ChartIcon />
      </RailButton>
      <div className="mt-auto" />
      <RailButton label="Settings" active={view === "settings"} onClick={() => onChange("settings")}>
        <GearIcon />
      </RailButton>
    </nav>
  );
}

function RailButton({
  children,
  label,
  active,
  onClick,
  badge,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="group relative flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-lg border border-orange-600/40 bg-orange-600/10"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className={`relative z-10 ${active ? "text-orange-400" : ""}`}>{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-0.5 top-0.5 z-20 min-w-[16px] rounded-full bg-orange-600 px-1 text-[9px] font-medium leading-4 text-white">
          {badge}
        </span>
      )}
      <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

function SettingsView() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-zinc-500">Configuration is read from the backend `.env` file.</p>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        <p>
          Live env (read-only). Edit <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">backend/.env</code> on
          the VPS and reload the service to change these.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-500">
          <li>SCRAPER_STUB — synthetic data switch (default 1 until methodology lands)</li>
          <li>CACHE_TTL_DAYS — how long a listing stays cached (default 7)</li>
          <li>WORKER_POOL_SIZE — max simultaneous browsers per job (default 3)</li>
          <li>TZ — calendar timezone (default Europe/Lisbon)</li>
          <li>CURRENCY — pinned currency on Airbnb URLs (default EUR)</li>
        </ul>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
