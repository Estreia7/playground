"use client";

import { useState } from "react";
import { Mark } from "./Icons.tsx";

/* The way in. Deliberately plain: one field, one button, no link anywhere
   else. The only flourish is the brand mark. */

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reorgsi/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return onSignedIn();
      setError(res.status === 401 ? "Palavra-passe incorreta." : "O servidor não respondeu. Tente outra vez.");
    } catch {
      setError("Sem ligação ao servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #1d3a44 0%, #152d35 38%, #112031 100%)" }}
    >
      <form onSubmit={submit} className="w-full max-w-sm" aria-describedby={error ? "rs-login-error" : undefined}>
        <div className="mb-8 flex items-center gap-3 text-white">
          <Mark size={40} />
          <div>
            <p className="m-0 text-xl font-bold tracking-tight">ReorgSI</p>
            <p className="m-0 text-sm" style={{ color: "#8fb0aa" }}>
              Direção Comercial
            </p>
          </div>
        </div>
        <label htmlFor="rs-password" className="mb-2 block text-sm font-semibold" style={{ color: "#d4ecdd" }}>
          Palavra-passe
        </label>
        <input
          id="rs-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block w-full rounded-xl border px-4 text-base text-white outline-none"
          style={{
            minHeight: 48,
            background: "rgba(248,255,254,0.06)",
            borderColor: error ? "#e0a24a" : "rgba(212,236,221,0.22)",
          }}
          aria-invalid={Boolean(error)}
        />
        <p id="rs-login-error" role="alert" className="mt-2 min-h-5 text-sm" style={{ color: "#f0c27d" }}>
          {error}
        </p>
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-3 w-full rounded-xl text-base font-semibold disabled:opacity-60"
          style={{ minHeight: 48, background: "#d4ecdd", color: "#112031" }}
        >
          {busy ? "A verificar…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
