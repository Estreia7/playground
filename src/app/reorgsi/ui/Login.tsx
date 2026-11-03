"use client";

import { useEffect, useRef, useState } from "react";
import { IconChart, IconCoin, IconEye, IconEyeSlash, IconKey, Mark } from "./Icons.tsx";
import { PropertyOrb } from "./PropertyOrb.tsx";

/* The way in. A split screen: the form on paper at the left, the orb from the
   intro turning slowly on deep azure at the right.

   Everything arrives in a short stagger (fade, rise, un-blur). On a correct
   password the form steps aside and the azure panel widens to fill the
   screen, so the hand-off to the intro, painted in the same azure, has no
   seam. Wrong password: the field shakes and says so.

   Still one field and one button. The server only checks a password, so
   there is no e-mail, no Google and no "create account" to promise. */

const ENTER_MS = 620;

const POINTS = [
  { Icon: IconKey, title: "Negócios", text: "O que falta em cada processo, do CPCV à escritura." },
  { Icon: IconCoin, title: "Comissões", text: "Apuradas por negócio, com as regras da equipa." },
  { Icon: IconChart, title: "Resultados", text: "Faturação e ranking contra o ano anterior." },
];

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reorgsi/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setEntering(true);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(onSignedIn, reduced ? 0 : ENTER_MS);
        return;
      }
      fail(res.status === 401 ? "Palavra-passe incorreta." : "O servidor não respondeu. Tente outra vez.");
    } catch {
      fail("Sem ligação ao servidor.");
    }
  }

  function fail(message: string) {
    setError(message);
    setShake((n) => n + 1);
    setBusy(false);
  }

  // The shake remounts the field (its key), so select the typo once it is back.
  useEffect(() => {
    if (shake) input.current?.select();
  }, [shake]);

  return (
    <main className="rs-login" data-entering={entering}>
      <section className="rs-login-form">
        <form onSubmit={submit} className="w-full max-w-sm" aria-describedby={error ? "rs-login-error" : undefined}>
          <div className="rs-in mb-12 flex items-center gap-3" style={{ "--d": "60ms" } as React.CSSProperties}>
            <Mark size={40} />
            <div>
              <p className="m-0 text-lg font-bold tracking-tight">ReorgSI</p>
              <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                Direção Comercial
              </p>
            </div>
          </div>

          <h1 className="rs-in rs-login-title" style={{ "--d": "140ms" } as React.CSSProperties}>
            Bem-vindo de volta
          </h1>
          <p className="rs-in mt-3 mb-9 text-base leading-relaxed" style={{ "--d": "220ms", color: "var(--muted)" } as React.CSSProperties}>
            Negócios, documentos e comissões da equipa num só painel.
          </p>

          <div className="rs-in" style={{ "--d": "300ms" } as React.CSSProperties}>
            <label htmlFor="rs-password" className="mb-2 block text-sm font-semibold" style={{ color: "var(--ink-2)" }}>
              Palavra-passe
            </label>
            <div key={shake} className="rs-login-field" data-error={Boolean(error)} data-shake={shake > 0}>
              <input
                ref={input}
                id="rs-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Introduza a palavra-passe"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
                aria-pressed={show}
              >
                {show ? <IconEyeSlash size={20} /> : <IconEye size={20} />}
              </button>
            </div>
            <p id="rs-login-error" role="alert" className="mt-2 min-h-5 text-sm font-medium" style={{ color: "var(--amber)" }}>
              {error}
            </p>
          </div>

          <button
            type="submit"
            disabled={busy || !password}
            className="rs-in rs-login-submit"
            style={{ "--d": "380ms" } as React.CSSProperties}
          >
            {entering ? "A entrar…" : busy ? "A verificar…" : "Entrar"}
          </button>

          <p className="rs-in mt-10 text-sm" style={{ "--d": "460ms", color: "var(--faint)" } as React.CSSProperties}>
            Acesso reservado à equipa. Sem palavra-passe? Peça-a à direção.
          </p>
        </form>
      </section>

      <Hero />
    </main>
  );
}

/** The azure panel. Only mounted on wide screens, so phones never run the
 *  canvas behind a panel they cannot see. */
function Hero() {
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const measure = () => {
      const el = panel.current;
      if (!mq.matches || !el) return setSize(0);
      const { width, height } = el.getBoundingClientRect();
      // Leave room at the bottom for the three cards.
      setSize(Math.round(Math.min(560, width * 0.86, (height - 180) * 0.92)));
    };
    measure();
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(measure, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <section className="rs-login-hero" aria-hidden="true">
      <div ref={panel} className="rs-login-panel">
        {size > 0 && (
          <div className="rs-login-orb">
            {/* A long duration keeps the traffic calm: this is a backdrop. */}
            <PropertyOrb size={size} durationMs={90_000} />
          </div>
        )}
        <div className="rs-login-points">
          {POINTS.map(({ Icon, title, text }, i) => (
            <div key={title} className="rs-login-point" style={{ "--d": `${900 + i * 160}ms` } as React.CSSProperties}>
              <span className="rs-login-point-icon">
                <Icon size={20} />
              </span>
              <div>
                <p className="m-0 text-sm font-semibold text-white">{title}</p>
                <p className="m-0 mt-0.5 text-[13px] leading-snug" style={{ color: "#a9c4bf" }}>
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
