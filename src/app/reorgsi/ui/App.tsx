"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  upload: (file: File, onProgress?: (fraction: number) => void) => Promise<FileRef | null>;
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
  type: "Formato não suportado ou ficheiro danificado. Use PDF, JPG, PNG ou WebP.",
  size: "O ficheiro tem mais de 15 MB.",
  empty: "O ficheiro está vazio.",
};

export function App({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

  // A fresh sign-in always lands on Início, whatever page asked for the password.
  const onSignedIn = useCallback(async () => {
    if (!(await load())) return;
    if (pathname !== "/reorgsi") router.replace("/reorgsi");
    setPhase("intro");
  }, [load, pathname, router]);

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
    async (raw: File, onProgress?: (fraction: number) => void): Promise<FileRef | null> => {
      try {
        const file = await prepareUpload(raw);
        const form = new FormData();
        form.append("file", file);
        // XHR rather than fetch: it reports how much of the body has been sent.
        const res = await new Promise<{ status: number; ok: boolean; text: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/reorgsi/files");
          xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
          xhr.onload = () => resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText });
          xhr.onerror = () => reject(new Error("network"));
          xhr.send(form);
        });
        let body: { file?: FileRef; error?: string } = {};
        try {
          body = JSON.parse(res.text);
        } catch {
          // not JSON: handled below as a failed upload
        }
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
      router.replace("/reorgsi");
    });
  }, [router]);

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
