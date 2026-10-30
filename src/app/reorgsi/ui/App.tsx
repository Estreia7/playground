"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Db, FileRef } from "../core/types.ts";
import type { Action } from "../core/actions.ts";
import { Login } from "./Login.tsx";
import { Intro } from "./Intro.tsx";
import { Shell } from "./Shell.tsx";
import { prepareUpload } from "./files/prepare.ts";
import { LightboxProvider } from "./files/Files.tsx";

/* The client side of ReorgSI: who may see it, the one-time intro, and the
   data every screen reads.

   The server is the only judge of access. The app asks for the data; a 401
   means the password page. After a correct password the intro plays, then
   the app. A reload within the same browser session skips the intro. */

type Phase = "checking" | "login" | "intro" | "ready";

export type DispatchResult = { ok: true; id?: string } | { ok: false; error: string };

interface Ctx {
  db: Db;
  dispatch: (action: Action) => Promise<DispatchResult>;
  upload: (file: File) => Promise<FileRef | null>;
  notify: (message: string, error?: boolean) => void;
  logout: () => void;
}

const ReorgContext = createContext<Ctx | null>(null);

export function useReorg(): Ctx {
  const ctx = useContext(ReorgContext);
  if (!ctx) throw new Error("useReorg outside <App>");
  return ctx;
}

const INTRO_KEY = "reorgsi.intro";

const ERRORS: Record<string, string> = {
  inUse: "Não é possível apagar: ainda há negócios associados.",
  invalid: "Faltam dados obrigatórios ou há um valor inválido.",
  notFound: "Este registo já não existe. Atualize a página.",
  unauthorized: "A sessão terminou. Introduza a palavra-passe outra vez.",
  type: "Formato não suportado. Use PDF, JPG, PNG ou WebP.",
  size: "O ficheiro tem mais de 15 MB.",
};

export function App({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [db, setDb] = useState<Db | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 5000 : 2600);
  }, []);

  const load = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/reorgsi", { cache: "no-store" });
    if (res.status === 401) return false;
    const body = (await res.json()) as { db: Db };
    setDb(body.db);
    return true;
  }, []);

  useEffect(() => {
    load()
      .then((ok) => {
        if (!ok) return setPhase("login");
        let seen = false;
        try {
          seen = sessionStorage.getItem(INTRO_KEY) === "1";
        } catch {
          // storage blocked: just play it
        }
        setPhase(seen ? "ready" : "intro");
      })
      .catch(() => setPhase("login"));
  }, [load]);

  const onSignedIn = useCallback(async () => {
    if (await load()) setPhase("intro");
  }, [load]);

  const onIntroDone = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // fine
    }
    setPhase("ready");
  }, []);

  const dispatch = useCallback(
    async (action: Action): Promise<DispatchResult> => {
      try {
        const res = await fetch("/api/reorgsi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        const body = (await res.json().catch(() => ({}))) as { db?: Db; id?: string; error?: string };
        if (res.status === 401) {
          setPhase("login");
          return { ok: false, error: "unauthorized" };
        }
        if (!res.ok || !body.db) {
          const error = body.error ?? "server";
          notify(ERRORS[error] ?? "Não foi possível guardar. Tente outra vez.", true);
          return { ok: false, error };
        }
        setDb(body.db);
        return { ok: true, id: body.id };
      } catch {
        notify("Sem ligação ao servidor. Nada foi guardado.", true);
        return { ok: false, error: "network" };
      }
    },
    [notify],
  );

  const upload = useCallback(
    async (raw: File): Promise<FileRef | null> => {
      try {
        const file = await prepareUpload(raw);
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/reorgsi/files", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as { file?: FileRef; error?: string };
        if (res.status === 401) setPhase("login");
        if (!res.ok || !body.file) {
          notify(ERRORS[body.error ?? ""] ?? "O envio falhou. Tente outra vez.", true);
          return null;
        }
        return body.file;
      } catch {
        notify("O envio falhou. Verifique a ligação.", true);
        return null;
      }
    },
    [notify],
  );

  const logout = useCallback(() => {
    fetch("/api/reorgsi/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).finally(() => {
      try {
        sessionStorage.removeItem(INTRO_KEY);
      } catch {
        // fine
      }
      setDb(null);
      setPhase("login");
    });
  }, []);

  if (phase === "checking") return <div className="min-h-dvh" style={{ background: "var(--ink)" }} aria-busy="true" />;
  if (phase === "login") return <Login onSignedIn={onSignedIn} />;
  if (!db) return null;

  return (
    <ReorgContext.Provider value={{ db, dispatch, upload, notify, logout }}>
      {phase === "intro" ? (
        <Intro onDone={onIntroDone} />
      ) : (
        <LightboxProvider>
          <Shell>{children}</Shell>
        </LightboxProvider>
      )}
      {toast && (
        <div className={`rs-toast ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"}>
          {toast.message}
        </div>
      )}
    </ReorgContext.Provider>
  );
}
