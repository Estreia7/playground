"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { translations, type Lang } from "./translations";
import productsData from "./products_database.json";

type Product = {
  product_id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  price_with_iva: number;
  stock: number;
  in_stock: boolean;
  description: string;
};

const TOTAL_SLIDES = 6;

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

function KpiIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
      <path d="M21 3v5h-5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function FinanceIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

const iconMap: Record<string, () => React.ReactNode> = {
  store: () => <StoreIcon />,
  chart: () => <ChartIcon />,
  globe: () => <GlobeIcon />,
  automation: () => <AutomationIcon />,
  kpi: () => <KpiIcon />,
  finance: () => <FinanceIcon />,
};

/* ─── Main Presentation ─── */
export default function Presentation() {
  const [slide, setSlide] = useState(0);
  const [lang, setLang] = useState<Lang>("pt");
  const [animating, setAnimating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const t = translations[lang];

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

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
          <button className="fullscreen-btn" onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
            )}
          </button>
          <span className="deck-counter">
            {slide + 1} / {TOTAL_SLIDES}
          </span>
        </div>
      </header>

      {/* ─── Floating exit fullscreen ─── */}
      {isFullscreen && (
        <button className="fullscreen-exit" onClick={toggleFullscreen} title="Exit fullscreen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}

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
          <SlideCases t={t} />
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
        <div className="cover-image-wrap">
          <img
            src="/papelaria-warehouse.png"
            alt="Papelaria da Vila"
            className="cover-image"
          />
          <img
            src="/papelaria-logo.png"
            alt="Papelaria da Vila Logo"
            className="cover-logo"
          />
        </div>
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

function SlideCases({ t }: { t: (typeof translations)["pt"] }) {
  const products = productsData as Product[];
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category.split(" > ")[0]))].sort(),
    [products]
  );
  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.brand.toLowerCase().includes(search.toLowerCase());
      const matchCat =
        !categoryFilter || p.category.startsWith(categoryFilter);
      const matchBrand = !brandFilter || p.brand === brandFilter;
      return matchSearch && matchCat && matchBrand;
    });
  }, [products, search, categoryFilter, brandFilter]);

  return (
    <section className="slide slide-cases">
      <div className="slide-inner slide-cases-inner">
        {/* Left: text */}
        <div className="cases-text">
          <span className="slide-label">{t.cases.label}</span>
          <h2 className="slide-title">{t.cases.title}</h2>
          <p className="slide-desc">{t.cases.description}</p>
          <div className="cases-stats">
            <div className="cases-stat-item">
              <span className="cases-stat-num">{products.length}</span>
              <span className="cases-stat-label">Produtos</span>
            </div>
            <div className="cases-stat-item">
              <span className="cases-stat-num">{brands.length}</span>
              <span className="cases-stat-label">Marcas</span>
            </div>
            <div className="cases-stat-item">
              <span className="cases-stat-num">{categories.length}</span>
              <span className="cases-stat-label">Categorias</span>
            </div>
          </div>
        </div>

        {/* Right: product browser */}
        <div className="product-browser">
          <div className="pb-header">
            <div className="pb-search-wrap">
              <svg className="pb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                className="pb-search"
                type="text"
                placeholder="Pesquisar produtos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="pb-filters">
              <select
                className="pb-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Todas Categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                className="pb-select"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Todas Marcas</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="pb-count">{filtered.length} produtos encontrados</div>
          <div className="pb-grid">
            {filtered.slice(0, 12).map((p) => (
              <div key={p.product_id} className="pb-card">
                <div className="pb-card-top">
                  <span className="pb-brand">{p.brand}</span>
                  <span className={`pb-stock ${p.in_stock ? "in" : "out"}`}>
                    {p.in_stock ? "Em stock" : "Esgotado"}
                  </span>
                </div>
                <h4 className="pb-name">{p.name}</h4>
                <div className="pb-card-bottom">
                  <span className="pb-price">{p.price_with_iva.toFixed(2)}€</span>
                  <span className="pb-stock-num">{p.stock} un.</span>
                </div>
              </div>
            ))}
          </div>
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
  .cover-image-wrap {
    position: relative;
    width: 100%;
    max-width: 560px;
    margin: 0 auto 28px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .cover-image {
    width: 100%;
    height: 180px;
    object-fit: cover;
    display: block;
    filter: brightness(0.85);
  }
  .cover-logo {
    position: absolute;
    bottom: 12px;
    left: 12px;
    height: 28px;
    width: auto;
    background: white;
    border-radius: 6px;
    padding: 4px 8px;
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
  .slide-services .slide-inner {
    max-width: 960px;
  }
  .slide-services .slide-desc {
    margin-bottom: 20px;
  }
  .services-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .service-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 18px;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .service-card:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .service-icon {
    color: var(--accent);
    margin-bottom: 10px;
  }
  .service-icon svg {
    width: 26px;
    height: 26px;
  }
  .service-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 6px;
  }
  .service-desc {
    font-size: 0.82rem;
    line-height: 1.5;
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

  /* ── Fullscreen button ── */
  .fullscreen-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .fullscreen-btn:hover {
    color: var(--text);
    border-color: var(--accent);
    background: rgba(239, 72, 35, 0.08);
  }

  /* ── Floating exit ── */
  .fullscreen-exit {
    position: fixed;
    top: 72px;
    right: 24px;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(13, 13, 13, 0.8);
    backdrop-filter: blur(16px);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.25s;
    opacity: 0.5;
  }
  .fullscreen-exit:hover {
    opacity: 1;
    color: white;
    border-color: var(--accent);
    background: rgba(239, 72, 35, 0.15);
    transform: scale(1.1);
  }

  /* ── Slide: Cases / Product Browser ── */
  .slide-cases-inner {
    max-width: 1100px;
    display: flex;
    gap: 32px;
    align-items: flex-start;
  }
  .cases-text {
    flex: 0 0 280px;
    padding-top: 8px;
  }
  .cases-text .slide-desc { margin-bottom: 24px; }
  .cases-stats {
    display: flex;
    gap: 20px;
  }
  .cases-stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cases-stat-num {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.02em;
  }
  .cases-stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Product browser */
  .product-browser {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 420px;
  }
  .pb-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pb-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .pb-search-icon {
    position: absolute;
    left: 10px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .pb-search {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 8px 32px;
    color: var(--text);
    font-size: 0.82rem;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
  }
  .pb-search::placeholder { color: var(--text-muted); }
  .pb-search:focus { border-color: var(--accent); }
  .pb-filters {
    display: flex;
    gap: 6px;
  }
  .pb-select {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    color: var(--text);
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
    -webkit-appearance: none;
  }
  .pb-select:focus { border-color: var(--accent); }
  .pb-select option { background: #1a1a1a; color: var(--text); }
  .pb-count {
    padding: 6px 16px;
    font-size: 0.72rem;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  .pb-grid {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 12px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    align-content: start;
  }
  .pb-grid::-webkit-scrollbar { width: 4px; }
  .pb-grid::-webkit-scrollbar-track { background: transparent; }
  .pb-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  .pb-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    transition: all 0.2s;
  }
  .pb-card:hover {
    border-color: var(--accent);
    background: rgba(239, 72, 35, 0.04);
  }
  .pb-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .pb-brand {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .pb-stock {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }
  .pb-stock.in { background: rgba(34,197,94,0.12); color: #22c55e; }
  .pb-stock.out { background: rgba(239,68,68,0.12); color: #ef4444; }
  .pb-name {
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.35;
    margin: 0 0 8px;
    color: rgba(245,243,239,0.85);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pb-card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pb-price {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text);
  }
  .pb-stock-num {
    font-size: 0.68rem;
    color: var(--text-muted);
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .slide { padding: 32px 20px; }
    .deck-header, .deck-footer { padding: 12px 20px; }
    .services-grid { grid-template-columns: 1fr; }
    .why-grid { grid-template-columns: repeat(2, 1fr); }
    .slide-cases-inner { flex-direction: column; }
    .cases-text { flex: none; }
    .product-browser { max-height: 320px; }
  }
  @media (max-width: 480px) {
    .why-grid { grid-template-columns: 1fr; }
  }
`;
