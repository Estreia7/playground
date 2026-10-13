"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./helpers";
import type {
  ImportRow,
  ProvidersPayload,
  RegistryPayload,
  RegistryProgress,
  RegistryStatus,
} from "./registryTypes";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body && (body.message || body.error)) || `HTTP ${res.status}`);
    (err as Error & { code?: string }).code = body?.error;
    throw err;
  }
  return body as T;
}

// RNAL Excel export → rows. Columns are found by header text (accents and
// case ignored), so a reordered export still imports.
const HEADERS: Record<keyof ImportRow, string[]> = {
  alNumber: ["no de registo", "n de registo", "numero de registo"],
  registeredAt: ["data do registo"],
  name: ["nome do alojamento"],
  modalidade: ["modalidade"],
  camas: ["no camas", "n camas"],
  utentes: ["no utentes", "n utentes"],
  quartos: ["no quartos", "n quartos"],
  address: ["localizacao (endereco)"],
  postalCode: ["localizacao (codigo postal)"],
  localidade: ["localizacao (localidade)"],
  freguesia: ["localizacao (freguesia)"],
  concelho: ["localizacao (concelho)"],
};

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/º/g, "o")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v && "text" in v) return String((v as { text: unknown }).text).trim() || null;
  if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result).trim() || null;
  const s = String(v).trim();
  return s || null;
}

export async function parseRnalWorkbook(file: File): Promise<ImportRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");

  let headerRow = -1;
  const colOf: Partial<Record<keyof ImportRow, number>> = {};
  ws.eachRow((row, i) => {
    if (headerRow !== -1 || i > 20) return;
    const values = row.values as unknown[];
    const idx = values.findIndex((v) => HEADERS.alNumber.includes(norm(v)));
    if (idx === -1) return;
    headerRow = i;
    values.forEach((v, c) => {
      const h = norm(v);
      for (const [key, names] of Object.entries(HEADERS) as Array<[keyof ImportRow, string[]]>) {
        if (names.includes(h)) colOf[key] = c;
      }
    });
  });
  if (headerRow === -1) {
    throw new Error("No “Nº de registo” column found — is this an RNAL export?");
  }

  const rows: ImportRow[] = [];
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const values = row.values as unknown[];
    const get = (k: keyof ImportRow) => (colOf[k] != null ? cellText(values[colOf[k]!]) : null);
    const al = get("alNumber");
    if (!al || !/^\d{1,9}(\s*\/\s*AL)?$/i.test(al)) return;
    rows.push({
      alNumber: al,
      name: get("name"),
      registeredAt: get("registeredAt"),
      modalidade: get("modalidade"),
      camas: get("camas"),
      utentes: get("utentes"),
      quartos: get("quartos"),
      address: get("address"),
      postalCode: get("postalCode"),
      localidade: get("localidade"),
      freguesia: get("freguesia"),
      concelho: get("concelho"),
    });
  });
  if (!rows.length) throw new Error("The sheet has the RNAL columns but no AL rows.");
  return rows;
}

export function useRegistryState(active: boolean) {
  const [data, setData] = useState<RegistryPayload | null>(null);
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [progress, setProgress] = useState<RegistryProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistryStatus | null>(null);

  // Live pipeline/queue state straight from the server — survives reloads and
  // covers work started elsewhere (auto-resume, other tabs). Polled while the
  // tab is open and visible.
  const refreshStatus = useCallback(async () => {
    try {
      const q = source ? `?source=${encodeURIComponent(source)}` : "";
      setStatus(await api<RegistryStatus>(`/al-registry/status${q}`));
    } catch {
      /* keep the last snapshot */
    }
  }, [source]);

  useEffect(() => {
    if (!active) return;
    refreshStatus();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshStatus();
    }, 5000);
    return () => clearInterval(t);
  }, [active, refreshStatus]);

  const refresh = useCallback(async () => {
    try {
      const q = source ? `?source=${encodeURIComponent(source)}` : "";
      setData(await api<RegistryPayload>(`/al-registry${q}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the registry.");
    }
  }, [source]);

  const refreshProviders = useCallback(async (balance = false) => {
    try {
      setProviders(await api<ProvidersPayload>(`/al-registry/providers${balance ? "?refresh=1" : ""}`));
    } catch {
      /* the panel shows its own empty state */
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  useEffect(() => {
    if (active) refreshProviders(true);
  }, [active, refreshProviders]);

  // Live updates: registry pipeline events, plus host jobs finishing (their
  // dossiers re-match the registry server-side). Debounced into one refresh.
  useEffect(() => {
    if (!active) return;
    const es = new EventSource(`${API_BASE}/jobs/stream`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = (withProviders = false) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        refreshStatus();
        if (withProviders) refreshProviders();
      }, 600);
    };
    es.addEventListener("al-registry", (e) => {
      try {
        const p = JSON.parse((e as MessageEvent).data) as RegistryProgress;
        if (p.phase !== "rematched") setProgress(p);
        soon(p.phase === "google" || p.phase === "paused" || p.phase === "done");
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener("job-status", () => soon());
    es.addEventListener("job-created", () => soon());
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [active, refresh, refreshStatus, refreshProviders]);

  const importFile = useCallback(
    async (file: File) => {
      const rows = await parseRnalWorkbook(file);
      const res = await api<{ imported: number; skipped: number; matchedFromDossiers: number; jobId: string | null }>(
        "/al-registry/import",
        { method: "POST", body: JSON.stringify({ sourceFile: file.name, rows }) }
      );
      setSource(file.name);
      await refresh();
      return res;
    },
    [refresh]
  );

  const runFree = useCallback(async () => {
    await api("/al-registry/run", { method: "POST" });
    await refresh();
  }, [refresh]);

  const runGoogle = useCallback(
    async (limit: number) => {
      const res = await api<{ jobId: string; alNumbers: string[] }>("/al-registry/google", {
        method: "POST",
        body: JSON.stringify({ limit }),
      });
      await refresh();
      return res;
    },
    [refresh]
  );

  const recheck = useCallback(
    async (al: string) => {
      await api(`/al-registry/${encodeURIComponent(al)}/recheck`, { method: "POST" });
      await refresh();
    },
    [refresh]
  );

  return {
    data,
    providers,
    source,
    setSource,
    progress,
    status,
    loadError,
    refresh,
    refreshProviders,
    importFile,
    runFree,
    runGoogle,
    recheck,
  };
}
