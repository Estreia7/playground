"use client";

import { useState, useCallback, useEffect } from "react";
import { translations, type Lang } from "./translations";

const TOTAL_SLIDES = 5;

const langLabels: Record<Lang, string> = { pt: "PT", en: "EN", es: "ES" };

/* ─── Icon components ─── */
function StoreIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}
function AutomationIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const iconMap: Record<string, () => React.ReactNode> = {
  store: () => <StoreIcon />,
  chart: () => <ChartIcon />,
  globe: () => <GlobeIcon />,
  automation: () => <AutomationIcon />,
};

/* ─── Main Presentation ─── */
export default function Presentation() {
  const [slide, setSlide] = useState(0);
  const [lang, setLang] = useState<Lang>("pt");
  const [animating, setAnimating] = useState(false);

  const t = translations[lang];

  const goTo = useCallback(
    (n: number) => {
      if (n < 0 || n >= TOTAL_SLIDES || animating) return;
      setAnimating(true);
      setSlide(n);
      setTimeout(() => setAnimating(false), 500);
    },
    [animating]
  );

  const next = useCallback(() => goTo(slide + 1), [slide, goTo]);
  const prev = useCallback(() => goTo(slide - 1), [slide, goTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev]);

  return (
    <div className="deck">
      <style>{styles}</style>

      {/* ─── Top bar ─── */}
      <header className="deck-header">
        <div className="deck-header-left">
          <span className="deck-logo">Aekios</span>
          <span className="deck-sep">·</span>
          <span className="deck-conf">
            {t.confidential} · {t.year}
          </span>
        </div>
        <div className="deck-header-right">
          <div className="lang-switch">
            {(Object.keys(langLabels) as Lang[]).map((l) => (
              <button
                key={l}
                className={`lang-btn ${lang === l ? "active" : ""}`}
                onClick={() => setLang(l)}
              >
                {langLabels[l]}
              </button>
            ))}
          </div>
          <span className="deck-counter">
            {slide + 1} / {TOTAL_SLIDES}
          </span>
        </div>
      </header>

      {/* ─── Slides container ─── */}
      <main className="deck-slides">
        <div
          className="deck-track"
          style={{ transform: `translateX(-${slide * 100}%)` }}
        >
          <SlideCover t={t} />
          <SlideAbout t={t} />
          <SlideServices t={t} />
          <SlideWhy t={t} />
          <SlideContact t={t} />
        </div>
      </main>

      {/* ─── Bottom nav ─── */}
      <footer className="deck-footer">
        <button
          className="nav-btn"
          onClick={prev}
          disabled={slide === 0}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="deck-dots">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              className={`deck-dot ${slide === i ? "active" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <button
          className="nav-btn"
          onClick={next}
          disabled={slide === TOTAL_SLIDES - 1}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </footer>
    </div>
  );
}

/* ─── Slide Components ─── */

function SlideCover({ t }: { t: (typeof translations)["pt"] }) {
  return (
    <section className="slide slide-cover">
      <div className="slide-inner">
        <div className="cover-glow" />
        <span className="slide-label">{t.cover.label}</span>
        <h1 className="cover-title">{t.cover.title}</h1>
        <p className="cover-subtitle">{t.cover.subtitle}</p>
        <p className="cover-desc">{t.cover.description}</p>
        <div className="cover-badges">
          <span className="badge">{t.cover.badge1}</span>
          <span className="badge">{t.cover.badge2}</span>
        </div>
        <a
          href="https://aekios.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          {t.cover.cta}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </a>
      </div>
    </section>
  );
}

function SlideAbout({ t }: { t: (typeof translations)["pt"] }) {
  return (
    <section className="slide slide-about">
      <div className="slide-inner">
        <span className="slide-label">{t.about.label}</span>
        <h2 className="slide-title">{t.about.title}</h2>
        <p className="slide-desc">{t.about.description}</p>
        <ul className="about-points">
          {t.about.points.map((p, i) => (
            <li key={i} className="about-point">
              <span className="point-dot" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SlideServices({ t }: { t: (typeof translations)["pt"] }) {
  return (
    <section className="slide slide-services">
      <div className="slide-inner">
        <span className="slide-label">{t.services.label}</span>
        <h2 className="slide-title">{t.services.title}</h2>
        <p className="slide-desc">{t.services.description}</p>
        <div className="services-grid">
          {t.services.items.map((item, i) => (
            <div key={i} className="service-card">
              <div className="service-icon">
                {iconMap[item.icon]?.()}
              </div>
              <h3 className="service-title">{item.title}</h3>
              <p className="service-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideWhy({ t }: { t: (typeof translations)["pt"] }) {
  return (
    <section className="slide slide-why">
      <div className="slide-inner">
        <span className="slide-label">{t.why.label}</span>
        <h2 className="slide-title">{t.why.title}</h2>
        <p className="slide-desc">{t.why.description}</p>
        <div className="why-grid">
          {t.why.cards.map((card, i) => (
            <div key={i} className="why-card">
              <span className="why-stat">{card.stat}</span>
              <h3 className="why-card-title">{card.title}</h3>
              <p className="why-card-desc">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideContact({ t }: { t: (typeof translations)["pt"] }) {
  return (
    <section className="slide slide-contact">
      <div className="slide-inner slide-contact-inner">
        <div className="contact-glow" />
        <span className="slide-label">{t.contact.label}</span>
        <h2 className="contact-title">{t.contact.title}</h2>
        <p className="slide-desc">{t.contact.description}</p>
        <a
          href={`mailto:${t.contact.email}`}
          className="btn-primary btn-lg"
        >
          {t.contact.cta}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </a>
        <div className="contact-meta">
          <span>{t.contact.email}</span>
          <span className="deck-sep">·</span>
          <span>{t.contact.details}</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Styles ─── */
const styles = `
  /* ── Reset & base ── */
  .deck {
    --accent: #EF4823;
    --accent-hover: #d93d1b;
    --bg: #0d0d0d;
    --bg-card: #161616;
    --bg-glass: rgba(22, 22, 22, 0.82);
    --border: rgba(255, 255, 255, 0.06);
    --text: #f5f3ef;
    --text-muted: rgba(245, 243, 239, 0.55);
    --radius: 16px;
    --radius-sm: 10px;

    position: fixed;
    inset: 0;
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ── */
  .deck-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    border-bottom: 1px solid var(--border);
    z-index: 10;
    backdrop-filter: blur(28px) saturate(1.4);
    background: var(--bg-glass);
  }
  .deck-header-left, .deck-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .deck-logo {
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.04em;
    color: var(--text);
  }
  .deck-sep { color: var(--text-muted); }
  .deck-conf {
    font-size: 0.8rem;
    color: var(--text-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .deck-counter {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
  }

  /* ── Language switcher ── */
  .lang-switch {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    padding: 3px;
  }
  .lang-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.04em;
  }
  .lang-btn:hover { color: var(--text); background: rgba(255,255,255,0.06); }
  .lang-btn.active {
    color: white;
    background: var(--accent);
  }

  /* ── Slides ── */
  .deck-slides {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .deck-track {
    display: flex;
    height: 100%;
    transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .slide {
    min-width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: 48px 32px;
  }
  .slide-inner {
    max-width: 800px;
    width: 100%;
  }

  /* ── Shared typography ── */
  .slide-label {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
  }
  .slide-title {
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 700;
    line-height: 1.15;
    margin: 0 0 16px;
    letter-spacing: -0.02em;
  }
  .slide-desc {
    font-size: 1.05rem;
    line-height: 1.7;
    color: var(--text-muted);
    margin: 0 0 32px;
    max-width: 640px;
  }

  /* ── Slide: Cover ── */
  .slide-cover {
    text-align: center;
    position: relative;
  }
  .slide-cover .slide-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .cover-glow {
    position: absolute;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
    opacity: 0.06;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .cover-title {
    font-size: clamp(2.4rem, 6vw, 4rem);
    font-weight: 700;
    line-height: 1.1;
    margin: 0 0 12px;
    letter-spacing: -0.03em;
  }
  .cover-subtitle {
    font-size: 1.15rem;
    color: var(--text-muted);
    margin: 0 0 20px;
    letter-spacing: 0.02em;
  }
  .cover-desc {
    font-size: 1.05rem;
    line-height: 1.7;
    color: var(--text-muted);
    max-width: 560px;
    margin: 0 auto 28px;
  }
  .cover-badges {
    display: flex;
    gap: 10px;
    margin-bottom: 32px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .badge {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 16px;
    border-radius: 100px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }

  /* ── Button ── */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 36px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 100px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    letter-spacing: 0.02em;
  }
  .btn-primary:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(239, 72, 35, 0.25);
  }
  .btn-lg {
    padding: 18px 44px;
    font-size: 1.05rem;
  }

  /* ── Slide: About ── */
  .about-points {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .about-point {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    font-size: 1rem;
    line-height: 1.6;
    color: rgba(245, 243, 239, 0.8);
  }
  .point-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 8px;
  }

  /* ── Slide: Services ── */
  .services-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .service-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 24px;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .service-card:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .service-icon {
    color: var(--accent);
    margin-bottom: 16px;
  }
  .service-title {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .service-desc {
    font-size: 0.88rem;
    line-height: 1.6;
    color: var(--text-muted);
    margin: 0;
  }

  /* ── Slide: Why ── */
  .why-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .why-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 20px;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .why-card:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
  }
  .why-stat {
    display: block;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 10px;
    letter-spacing: -0.02em;
  }
  .why-card-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .why-card-desc {
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-muted);
    margin: 0;
  }

  /* ── Slide: Contact ── */
  .slide-contact { text-align: center; position: relative; }
  .slide-contact-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .contact-glow {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
    opacity: 0.05;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .contact-title {
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 700;
    line-height: 1.1;
    margin: 0 0 16px;
    letter-spacing: -0.02em;
  }
  .contact-meta {
    margin-top: 24px;
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  /* ── Footer nav ── */
  .deck-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 16px 32px;
    border-top: 1px solid var(--border);
    backdrop-filter: blur(28px) saturate(1.4);
    background: var(--bg-glass);
  }
  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }
  .nav-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(239, 72, 35, 0.08);
  }
  .nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
  .deck-dots {
    display: flex;
    gap: 8px;
  }
  .deck-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.15);
    cursor: pointer;
    padding: 0;
    transition: all 0.3s;
  }
  .deck-dot:hover { background: rgba(255,255,255,0.3); }
  .deck-dot.active {
    background: var(--accent);
    width: 24px;
    border-radius: 4px;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .slide { padding: 32px 20px; }
    .deck-header, .deck-footer { padding: 12px 20px; }
    .services-grid { grid-template-columns: 1fr; }
    .why-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .why-grid { grid-template-columns: 1fr; }
  }
`;
