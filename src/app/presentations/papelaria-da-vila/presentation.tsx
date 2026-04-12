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
  image_url: string;
  ean: string;
  catalog_page: number;
};

const TOTAL_SLIDES = 8;

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

/* ─── Password Gate ─── */
const DECK_PASSWORD = "papelaria";

/* ─── Main Presentation ─── */
export default function Presentation() {
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);

  const [slide, setSlide] = useState(0);
  const [lang, setLang] = useState<Lang>("pt");
  const [animating, setAnimating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const t = translations[lang];

  const handleUnlock = () => {
    if (pw.toLowerCase() === DECK_PASSWORD) {
      setUnlocked(true);
      setPwError(false);
    } else {
      setPwError(true);
      setPw("");
    }
  };

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

  if (!unlocked) {
    return (
      <div className="deck">
        <style>{styles}</style>
        <div className="pw-gate">
          <div className="pw-card">
            <div className="pw-logo">Aekios</div>
            <p className="pw-subtitle">Papelaria da Vila × Aekios</p>
            <h2 className="pw-title">Apresentação Privada</h2>
            <p className="pw-desc">Introduza a palavra-passe para aceder.</p>
            <form
              className="pw-form"
              onSubmit={(e) => { e.preventDefault(); handleUnlock(); }}
            >
              <input
                className={`pw-input ${pwError ? "pw-input-error" : ""}`}
                type="password"
                placeholder="Palavra-passe"
                value={pw}
                onChange={(e) => { setPw(e.target.value); setPwError(false); }}
                autoFocus
              />
              <button className="pw-btn" type="submit">
                Entrar
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </form>
            {pwError && <p className="pw-error">Palavra-passe incorreta</p>}
            <p className="pw-conf">Confidencial · 2026</p>
          </div>
        </div>
      </div>
    );
  }

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
          <SlideWorkflow />
          <SlideInvoices />
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

type BrowserTab = "database" | "financial" | "analytics";

function SlideCases({ t }: { t: (typeof translations)["pt"] }) {
  const products = productsData as Product[];
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<BrowserTab>("database");

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

  // Fictitious realistic financial data for a stationery wholesaler
  const totalStock = products.reduce((s, p) => s + p.stock, 0);
  const stockValue = products.reduce((s, p) => s + p.price * p.stock, 0);

  const tabLabels: Record<BrowserTab, { label: string; icon: string }> = {
    database: { label: "Base de Dados", icon: "db" },
    financial: { label: "Financeiro", icon: "fin" },
    analytics: { label: "Análises", icon: "ana" },
  };

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
          {/* Branded top bar */}
          <div className="pb-brand-bar">
            <img src="/papelaria-logo.png" alt="Papelaria da Vila" className="pb-logo" />
            <span className="pb-brand-title">Catálogo Digital</span>
          </div>

          {/* Tabs */}
          <div className="pb-tabs">
            {(Object.keys(tabLabels) as BrowserTab[]).map((tab) => (
              <button
                key={tab}
                className={`pb-tab ${activeTab === tab ? "active" : ""}`}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab); setSelected(null); }}
              >
                {tab === "database" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                )}
                {tab === "financial" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                )}
                {tab === "analytics" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                )}
                {tabLabels[tab].label}
              </button>
            ))}
          </div>

          {/* Tab: Base de Dados */}
          {activeTab === "database" && (
            <>
              {selected ? (
                <div className="pb-detail">
                  <button
                    className="pb-detail-close"
                    onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                  <div className="pb-detail-img-wrap">
                    <img
                      src={selected.image_url}
                      alt={selected.name}
                      className="pb-detail-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/papelaria-logo.png";
                        (e.target as HTMLImageElement).className = "pb-detail-img pb-detail-img-fallback";
                      }}
                    />
                  </div>
                  <div className="pb-detail-info">
                    <span className="pb-brand">{selected.brand}</span>
                    <h3 className="pb-detail-name">{selected.name}</h3>
                    <p className="pb-detail-desc">{selected.description}</p>
                    <div className="pb-detail-meta">
                      <div className="pb-detail-meta-item">
                        <span className="pb-detail-meta-label">Categoria</span>
                        <span className="pb-detail-meta-value">{selected.category}</span>
                      </div>
                      <div className="pb-detail-meta-item">
                        <span className="pb-detail-meta-label">EAN</span>
                        <span className="pb-detail-meta-value">{selected.ean}</span>
                      </div>
                      <div className="pb-detail-meta-item">
                        <span className="pb-detail-meta-label">Pág. Catálogo</span>
                        <span className="pb-detail-meta-value">{selected.catalog_page}</span>
                      </div>
                    </div>
                    <div className="pb-detail-bottom">
                      <div className="pb-detail-prices">
                        <span className="pb-detail-price">{selected.price_with_iva.toFixed(2)}€</span>
                        <span className="pb-detail-price-net">s/IVA {selected.price.toFixed(2)}€</span>
                      </div>
                      <div className="pb-detail-stock-info">
                        <span className={`pb-stock ${selected.in_stock ? "in" : "out"}`}>
                          {selected.in_stock ? "Em stock" : "Esgotado"}
                        </span>
                        <span className="pb-stock-num">{selected.stock} un.</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                      <div
                        key={p.product_id}
                        className="pb-card"
                        onClick={(e) => { e.stopPropagation(); setSelected(p); }}
                        style={{ cursor: "pointer" }}
                      >
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
                </>
              )}
            </>
          )}

          {/* Tab: Financeiro */}
          {activeTab === "financial" && (
            <div className="pb-fin">
              <div className="pb-fin-kpis">
                <div className="pb-fin-kpi">
                  <span className="pb-fin-kpi-value">487.320€</span>
                  <span className="pb-fin-kpi-label">Faturação Anual (2025)</span>
                </div>
                <div className="pb-fin-kpi">
                  <span className="pb-fin-kpi-value">312.840€</span>
                  <span className="pb-fin-kpi-label">Custos Operacionais</span>
                </div>
                <div className="pb-fin-kpi">
                  <span className="pb-fin-kpi-value">174.480€</span>
                  <span className="pb-fin-kpi-label">Lucro Bruto</span>
                </div>
                <div className="pb-fin-kpi">
                  <span className="pb-fin-kpi-value pb-fin-kpi-accent">35.8%</span>
                  <span className="pb-fin-kpi-label">Margem Bruta</span>
                </div>
              </div>
              <div className="pb-fin-row">
                <div className="pb-fin-card">
                  <h4 className="pb-fin-card-title">Demonstração de Resultados</h4>
                  <div className="pb-fin-stat-list">
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Vendas Loja Física</span>
                      <span className="pb-fin-stat-value">298.450€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Vendas B2B</span>
                      <span className="pb-fin-stat-value">142.870€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Vendas Online</span>
                      <span className="pb-fin-stat-value">46.000€</span>
                    </div>
                    <div className="pb-fin-stat-row pb-fin-divider">
                      <span className="pb-fin-stat-label">Custo Mercadorias (CMV)</span>
                      <span className="pb-fin-stat-value pb-fin-red">-218.640€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Salários (8 func.)</span>
                      <span className="pb-fin-stat-value pb-fin-red">-62.400€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Renda + Utilities</span>
                      <span className="pb-fin-stat-value pb-fin-red">-18.600€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Outros Custos</span>
                      <span className="pb-fin-stat-value pb-fin-red">-13.200€</span>
                    </div>
                    <div className="pb-fin-stat-row pb-fin-total">
                      <span className="pb-fin-stat-label">Resultado Líquido</span>
                      <span className="pb-fin-stat-value pb-fin-green">121.480€</span>
                    </div>
                  </div>
                </div>
                <div className="pb-fin-card">
                  <h4 className="pb-fin-card-title">Inventário & Cash-Flow</h4>
                  <div className="pb-fin-stat-list">
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Valor em Stock</span>
                      <span className="pb-fin-stat-value">{stockValue.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Unidades em Armazém</span>
                      <span className="pb-fin-stat-value">{totalStock.toLocaleString("pt-PT")}</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Rotação de Stock</span>
                      <span className="pb-fin-stat-value">4.2x /ano</span>
                    </div>
                    <div className="pb-fin-stat-row pb-fin-divider">
                      <span className="pb-fin-stat-label">Contas a Receber</span>
                      <span className="pb-fin-stat-value">38.750€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Contas a Pagar</span>
                      <span className="pb-fin-stat-value pb-fin-red">-24.300€</span>
                    </div>
                    <div className="pb-fin-stat-row">
                      <span className="pb-fin-stat-label">Prazo Médio Recebimento</span>
                      <span className="pb-fin-stat-value">32 dias</span>
                    </div>
                    <div className="pb-fin-stat-row pb-fin-total">
                      <span className="pb-fin-stat-label">Cash-Flow Mensal</span>
                      <span className="pb-fin-stat-value pb-fin-green">+8.420€</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Análises */}
          {activeTab === "analytics" && (
            <div className="pb-ana">
              {/* KPI row */}
              <div className="pb-ana-kpis">
                <div className="pb-ana-kpi">
                  <span className="pb-ana-kpi-value">1.247</span>
                  <span className="pb-ana-kpi-label">Encomendas / Mês</span>
                  <span className="pb-ana-kpi-trend pb-ana-trend-up">+12%</span>
                </div>
                <div className="pb-ana-kpi">
                  <span className="pb-ana-kpi-value">68€</span>
                  <span className="pb-ana-kpi-label">Ticket Médio</span>
                  <span className="pb-ana-kpi-trend pb-ana-trend-up">+4.2%</span>
                </div>
                <div className="pb-ana-kpi">
                  <span className="pb-ana-kpi-value">82%</span>
                  <span className="pb-ana-kpi-label">Taxa Retenção</span>
                  <span className="pb-ana-kpi-trend pb-ana-trend-down">-1.3%</span>
                </div>
              </div>

              {/* Monthly revenue chart */}
              <div className="pb-ana-section">
                <h4 className="pb-ana-title">Faturação Mensal (2025)</h4>
                <div className="pb-ana-chart">
                  {[
                    { m: "Jan", v: 32400 },
                    { m: "Fev", v: 29800 },
                    { m: "Mar", v: 38100 },
                    { m: "Abr", v: 35600 },
                    { m: "Mai", v: 41200 },
                    { m: "Jun", v: 37800 },
                    { m: "Jul", v: 28400 },
                    { m: "Ago", v: 22100 },
                    { m: "Set", v: 52600 },
                    { m: "Out", v: 48300 },
                    { m: "Nov", v: 45200 },
                    { m: "Dez", v: 39800 },
                  ].map((d) => (
                    <div key={d.m} className="pb-ana-chart-col">
                      <div className="pb-ana-chart-bar-wrap">
                        <div
                          className="pb-ana-chart-bar"
                          style={{ height: `${(d.v / 52600) * 100}%` }}
                        />
                      </div>
                      <span className="pb-ana-chart-label">{d.m}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pb-ana-row">
                {/* Sales by channel */}
                <div className="pb-ana-section pb-ana-half">
                  <h4 className="pb-ana-title">Vendas por Canal</h4>
                  <div className="pb-ana-bars">
                    {[
                      { label: "Loja Física", value: 61, color: "blue" },
                      { label: "B2B Empresas", value: 29, color: "orange" },
                      { label: "Online", value: 10, color: "green" },
                    ].map((ch) => (
                      <div key={ch.label} className="pb-ana-bar-row">
                        <span className="pb-ana-bar-label">{ch.label}</span>
                        <div className="pb-ana-bar-track">
                          <div className={`pb-ana-bar-fill pb-ana-bar-${ch.color}`} style={{ width: `${ch.value}%` }} />
                        </div>
                        <span className="pb-ana-bar-value">{ch.value}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="pb-ana-mini-stats">
                    <div className="pb-ana-mini">
                      <span className="pb-ana-mini-label">Clientes B2B Ativos</span>
                      <span className="pb-ana-mini-value">43</span>
                    </div>
                    <div className="pb-ana-mini">
                      <span className="pb-ana-mini-label">Novos Clientes / Mês</span>
                      <span className="pb-ana-mini-value">7</span>
                    </div>
                  </div>
                </div>

                {/* Top sellers */}
                <div className="pb-ana-section pb-ana-half">
                  <h4 className="pb-ana-title">Performance Vendedores</h4>
                  <div className="pb-ana-sellers">
                    {[
                      { name: "Ana Rodrigues", sales: 14820, target: 15000 },
                      { name: "Carlos Mendes", sales: 12340, target: 13000 },
                      { name: "Sofia Almeida", sales: 11980, target: 12000 },
                      { name: "Miguel Costa", sales: 9450, target: 11000 },
                    ].map((s) => (
                      <div key={s.name} className="pb-ana-seller">
                        <div className="pb-ana-seller-top">
                          <span className="pb-ana-seller-name">{s.name}</span>
                          <span className="pb-ana-seller-pct">{Math.round((s.sales / s.target) * 100)}%</span>
                        </div>
                        <div className="pb-ana-seller-bar-track">
                          <div
                            className={`pb-ana-seller-bar-fill ${(s.sales / s.target) >= 0.9 ? "pb-ana-seller-good" : "pb-ana-seller-warn"}`}
                            style={{ width: `${Math.min((s.sales / s.target) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="pb-ana-seller-nums">
                          <span>{s.sales.toLocaleString("pt-PT")}€</span>
                          <span className="pb-ana-seller-target">meta {s.target.toLocaleString("pt-PT")}€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top selling categories */}
              <div className="pb-ana-section">
                <h4 className="pb-ana-title">Top Categorias por Receita</h4>
                <div className="pb-ana-bars">
                  {[
                    { label: "Material Escritório", value: 142300, pct: 100 },
                    { label: "Papel & Impressão", value: 98700, pct: 69 },
                    { label: "Arquivo & Organização", value: 72400, pct: 51 },
                    { label: "Escolar", value: 65800, pct: 46 },
                    { label: "Informática & Acess.", value: 48200, pct: 34 },
                  ].map((c) => (
                    <div key={c.label} className="pb-ana-bar-row">
                      <span className="pb-ana-bar-label">{c.label}</span>
                      <div className="pb-ana-bar-track">
                        <div className="pb-ana-bar-fill pb-ana-bar-blue" style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className="pb-ana-bar-value">{(c.value / 1000).toFixed(0)}k€</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Slide: Workflow Demo (WhatsApp → WebApp → Warehouse) ─── */
function SlideWorkflow() {
  const [orderSent, setOrderSent] = useState(false);
  const [ticketGenerated, setTicketGenerated] = useState(false);
  const [warehouseReady, setWarehouseReady] = useState(false);

  const handleSendOrder = () => {
    setOrderSent(true);
    setTimeout(() => setTicketGenerated(true), 900);
    setTimeout(() => setWarehouseReady(true), 1800);
  };

  const handleReset = () => {
    setOrderSent(false);
    setTicketGenerated(false);
    setWarehouseReady(false);
  };

  return (
    <section className="slide slide-workflow">
      <div className="slide-inner slide-workflow-inner">
        <div className="wf-header">
          <span className="slide-label">Fluxo Automatizado</span>
          <h2 className="slide-title">Do Pedido à Preparação</h2>
          <p className="slide-desc">Encomendas feitas ao domingo à noite chegam organizadas ao armazém na segunda de manhã — sem intervenção manual.</p>
        </div>

        <div className="wf-windows">
          {/* ─ Arrow connectors ─ */}
          <div className="wf-arrow wf-arrow-1">
            <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
              <path d="M0 12h32m0 0l-6-6m6 6l-6 6" stroke={orderSent ? "#25D366" : "#444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"stroke 0.4s"}} />
            </svg>
          </div>
          <div className="wf-arrow wf-arrow-2">
            <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
              <path d="M0 12h32m0 0l-6-6m6 6l-6 6" stroke={ticketGenerated ? "#1a6fb5" : "#444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"stroke 0.4s"}} />
            </svg>
          </div>

          {/* ─── Window 1: WhatsApp ─── */}
          <div className={`wf-window wf-whatsapp ${orderSent ? "wf-sent" : ""}`}>
            <div className="wf-phone-frame">
              {/* Status bar */}
              <div className="wf-phone-status">
                <span>18:47</span>
                <div className="wf-phone-status-icons">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.24 4.24 0 00-6 0zm-4-4l2 2a7.07 7.07 0 0110 0l2-2C15.68 9.68 8.32 9.68 5 13z"/></svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
                </div>
              </div>
              {/* WhatsApp header */}
              <div className="wf-wa-header">
                <div className="wf-wa-avatar">PV</div>
                <div className="wf-wa-header-info">
                  <span className="wf-wa-name">Papelaria da Vila</span>
                  <span className="wf-wa-status">online</span>
                </div>
              </div>
              {/* Date chip */}
              <div className="wf-wa-date">
                <span>Domingo</span>
              </div>
              {/* Messages */}
              <div className="wf-wa-messages">
                <div className="wf-wa-msg wf-wa-msg-sent">
                  <p>Olá! Queria fazer uma encomenda para segunda-feira por favor 🙏</p>
                  <span className="wf-wa-time">18:45</span>
                </div>
                <div className="wf-wa-msg wf-wa-msg-sent">
                  <p><strong>Encomenda #1247</strong></p>
                  <p>• Resma Papel A4 Navigator × 10<br/>• Caneta BIC Cristal Azul × 50<br/>• Dossier A4 Lombada 80mm × 5<br/>• Post-it 76×76mm × 20</p>
                  <span className="wf-wa-time">18:47</span>
                </div>
                <div className="wf-wa-msg wf-wa-msg-recv">
                  <p>Recebido ✅ A sua encomenda será processada automaticamente e preparada na segunda de manhã!</p>
                  <span className="wf-wa-time">18:47</span>
                </div>
              </div>
              {/* Send button */}
              <div className="wf-wa-bottom">
                {!orderSent ? (
                  <button className="wf-wa-send-btn" onClick={(e) => { e.stopPropagation(); handleSendOrder(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Enviar Encomenda
                  </button>
                ) : (
                  <div className="wf-wa-sent-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Enviado
                  </div>
                )}
              </div>
            </div>
            <span className="wf-window-label">Cliente — WhatsApp</span>
          </div>

          {/* ─── Window 2: WebApp ─── */}
          <div className={`wf-window wf-webapp ${ticketGenerated ? "wf-active" : ""}`}>
            <div className="wf-webapp-frame">
              <div className="wf-webapp-topbar">
                <div className="wf-webapp-dots">
                  <span className="wf-dot-r"></span>
                  <span className="wf-dot-y"></span>
                  <span className="wf-dot-g"></span>
                </div>
                <span className="wf-webapp-url">app.papelariadavila.pt/encomendas</span>
              </div>
              <div className="wf-webapp-nav">
                <span className="wf-webapp-nav-item active">Encomendas</span>
                <span className="wf-webapp-nav-item">Clientes</span>
                <span className="wf-webapp-nav-item">Stock</span>
              </div>
              <div className="wf-webapp-body">
                {!orderSent && (
                  <div className="wf-webapp-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="12" y2="13"/></svg>
                    <span>A aguardar encomendas...</span>
                  </div>
                )}
                {orderSent && (
                  <div className={`wf-webapp-order ${ticketGenerated ? "wf-webapp-order-ready" : "wf-webapp-order-entering"}`}>
                    <div className="wf-webapp-order-header">
                      <div className="wf-webapp-order-badge">NOVA</div>
                      <span className="wf-webapp-order-id">#1247</span>
                      <span className="wf-webapp-order-date">Dom 18:47</span>
                    </div>
                    <div className="wf-webapp-order-client">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Escola Básica São João
                    </div>
                    <div className="wf-webapp-order-items">
                      <div className="wf-webapp-item"><span>Resma Papel A4 Navigator</span><span>×10</span></div>
                      <div className="wf-webapp-item"><span>Caneta BIC Cristal Azul</span><span>×50</span></div>
                      <div className="wf-webapp-item"><span>Dossier A4 Lombada 80mm</span><span>×5</span></div>
                      <div className="wf-webapp-item"><span>Post-it 76×76mm</span><span>×20</span></div>
                    </div>
                    <div className="wf-webapp-order-footer">
                      <span className="wf-webapp-total">Total: 187.40€</span>
                      {ticketGenerated && (
                        <div className="wf-webapp-ticket-badge">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Ticket gerado
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="wf-window-label">Back-Office — WebApp</span>
          </div>

          {/* ─── Window 3: Warehouse Tablet ─── */}
          <div className={`wf-window wf-warehouse ${warehouseReady ? "wf-active" : ""}`}>
            <div className="wf-tablet-frame">
              <div className="wf-tablet-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span>Armazém — Preparação</span>
                <span className="wf-tablet-date">Seg, 08:00</span>
              </div>
              <div className="wf-tablet-body">
                {!warehouseReady && (
                  <div className="wf-tablet-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 16 16 16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    <span>Sem encomendas pendentes</span>
                  </div>
                )}
                {warehouseReady && (
                  <div className="wf-tablet-order wf-tablet-order-appear">
                    <div className="wf-tablet-order-top">
                      <div className="wf-tablet-priority">PREPARAR</div>
                      <span className="wf-tablet-order-id">#1247</span>
                    </div>
                    <div className="wf-tablet-client-info">
                      <strong>Escola Básica São João</strong>
                      <span>Entrega: Segunda-feira, manhã</span>
                    </div>
                    <div className="wf-tablet-items">
                      <div className="wf-tablet-item">
                        <div className="wf-tablet-check"></div>
                        <span>Resma Papel A4 Navigator</span>
                        <strong>×10</strong>
                      </div>
                      <div className="wf-tablet-item">
                        <div className="wf-tablet-check"></div>
                        <span>Caneta BIC Cristal Azul</span>
                        <strong>×50</strong>
                      </div>
                      <div className="wf-tablet-item">
                        <div className="wf-tablet-check"></div>
                        <span>Dossier A4 Lombada 80mm</span>
                        <strong>×5</strong>
                      </div>
                      <div className="wf-tablet-item">
                        <div className="wf-tablet-check"></div>
                        <span>Post-it 76×76mm</span>
                        <strong>×20</strong>
                      </div>
                    </div>
                    <div className="wf-tablet-note">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Recebida via WhatsApp · Processada automaticamente
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="wf-window-label">Armazém — Tablet</span>
          </div>
        </div>

        {orderSent && (
          <button className="wf-reset-btn" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Repetir Demo
          </button>
        )}
      </div>
    </section>
  );
}

/* ─── Slide: Invoice Scanner ─── */
type ParsedInvoice = {
  invoice_number: string;
  date: string;
  client_name: string;
  client_nif: string;
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  payment_method: string;
};

function SlideInvoices() {
  const [files, setFiles] = useState<{ name: string; base64: string; mediaType: string; preview: string }[]>([]);
  const [invoices, setInvoices] = useState<ParsedInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [mobileStep, setMobileStep] = useState<"capture" | "confirm">("capture");
  const isMobile = typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

  const readFile = useCallback((file: File) => {
    return new Promise<{ name: string; base64: string; mediaType: string; preview: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve({
          name: file.name,
          base64,
          mediaType: file.type || "image/jpeg",
          preview: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    const results = await Promise.all(arr.map(readFile));
    setFiles((prev) => [...prev, ...results]);
    if (isMobile) setMobileStep("confirm");
  }, [readFile, isMobile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const parseInvoices = useCallback(async () => {
    if (!files.length) return;
    setLoading(true);
    setError("");
    setInvoices([]);
    try {
      const res = await fetch("/api/parse-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: files.map((f) => ({ base64: f.base64, mediaType: f.mediaType })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse");
      setInvoices(data.invoices);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao processar faturas");
    } finally {
      setLoading(false);
    }
  }, [files]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setInvoices([]);
    setError("");
    setMobileStep("capture");
  }, []);

  return (
    <section className="slide slide-invoices">
      <div className="slide-inner slide-invoices-inner">
        {/* Left: drop zone / camera */}
        <div className="inv-left">
          <span className="slide-label">Automação</span>
          <h2 className="slide-title" style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)" }}>Scanner de Faturas</h2>
          <p className="slide-desc" style={{ fontSize: "0.92rem", marginBottom: "16px" }}>
            Digitalize faturas em segundos. Arraste documentos ou tire uma fotografia — a IA extrai todos os dados automaticamente.
          </p>

          {!invoices.length && (
            <>
              {/* Desktop: drag & drop zone */}
              {!isMobile && (
                <div
                  className={`inv-dropzone ${dragOver ? "inv-dropzone-active" : ""} ${files.length ? "inv-dropzone-has-files" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={(e) => {
                    e.stopPropagation();
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.multiple = true;
                    input.onchange = () => input.files && handleFiles(input.files);
                    input.click();
                  }}
                >
                  {files.length === 0 ? (
                    <>
                      <svg className="inv-drop-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      <span className="inv-drop-text">Arraste faturas aqui</span>
                      <span className="inv-drop-sub">ou clique para selecionar</span>
                    </>
                  ) : (
                    <div className="inv-file-list">
                      {files.map((f, i) => (
                        <div key={i} className="inv-file-item">
                          <img src={f.preview} alt={f.name} className="inv-file-thumb" />
                          <span className="inv-file-name">{f.name.length > 20 ? f.name.slice(0, 20) + "…" : f.name}</span>
                          <button className="inv-file-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      ))}
                      <span className="inv-drop-sub" style={{ marginTop: "6px" }}>+ arrastar mais faturas</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile: camera / file picker */}
              {isMobile && mobileStep === "capture" && (
                <div className="inv-mobile-capture">
                  <button
                    className="inv-mobile-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.capture = "environment";
                      input.onchange = () => input.files && handleFiles(input.files);
                      input.click();
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    Fotografar Fatura
                  </button>
                  <button
                    className="inv-mobile-btn inv-mobile-btn-sec"
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.multiple = true;
                      input.onchange = () => input.files && handleFiles(input.files);
                      input.click();
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    Escolher Ficheiro
                  </button>
                </div>
              )}

              {isMobile && mobileStep === "confirm" && files.length > 0 && (
                <div className="inv-mobile-confirm">
                  <div className="inv-file-list">
                    {files.map((f, i) => (
                      <div key={i} className="inv-file-item">
                        <img src={f.preview} alt={f.name} className="inv-file-thumb" />
                        <span className="inv-file-name">{f.name.length > 18 ? f.name.slice(0, 18) + "…" : f.name}</span>
                        <button className="inv-file-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="inv-mobile-btn inv-mobile-btn-sec"
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.capture = "environment";
                      input.onchange = () => input.files && handleFiles(input.files);
                      input.click();
                    }}
                  >
                    + Adicionar Outra Fatura
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {files.length > 0 && (
                <div className="inv-actions">
                  <button className="inv-parse-btn" onClick={(e) => { e.stopPropagation(); parseInvoices(); }} disabled={loading}>
                    {loading ? (
                      <>
                        <span className="inv-spinner" />
                        A processar {files.length} fatura{files.length > 1 ? "s" : ""}…
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                        Analisar {files.length} Fatura{files.length > 1 ? "s" : ""}
                      </>
                    )}
                  </button>
                </div>
              )}
              {error && <p className="inv-error">{error}</p>}
            </>
          )}

          {invoices.length > 0 && (
            <div className="inv-done">
              <div className="inv-done-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {invoices.length} fatura{invoices.length > 1 ? "s" : ""} processada{invoices.length > 1 ? "s" : ""}
              </div>
              <button className="inv-reset-btn" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                Nova Digitalização
              </button>
            </div>
          )}
        </div>

        {/* Right: results table */}
        <div className="inv-right">
          <div className="inv-browser">
            <div className="inv-browser-bar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
              <span>Base de Dados — Faturas</span>
            </div>
            {invoices.length === 0 && !loading && (
              <div className="inv-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"><rect x="2" y="3" width="20" height="18" rx="2" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
                <span>As faturas digitalizadas aparecem aqui</span>
              </div>
            )}
            {loading && (
              <div className="inv-loading">
                <div className="inv-loading-anim">
                  <div className="inv-scan-line" />
                </div>
                <span className="inv-loading-text">A analisar com IA…</span>
                <div className="inv-loading-steps">
                  <span className="inv-step active">Leitura OCR</span>
                  <span className="inv-step active">Extração de dados</span>
                  <span className="inv-step">Validação NIF</span>
                </div>
              </div>
            )}
            {invoices.length > 0 && (
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>N.º Fatura</th>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>NIF</th>
                      <th>Subtotal</th>
                      <th>IVA</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, i) => (
                      <tr key={i}>
                        <td className="inv-td-num">{inv.invoice_number || "—"}</td>
                        <td>{inv.date || "—"}</td>
                        <td className="inv-td-client">{inv.client_name || "—"}</td>
                        <td className="inv-td-nif">{inv.client_nif || "—"}</td>
                        <td className="inv-td-money">{inv.subtotal ? `${inv.subtotal.toFixed(2)}€` : "—"}</td>
                        <td className="inv-td-money">{inv.vat_amount ? `${inv.vat_amount.toFixed(2)}€` : "—"}<br /><span className="inv-vat-rate">{inv.vat_rate ? `${inv.vat_rate}%` : ""}</span></td>
                        <td className="inv-td-total">{inv.total ? `${inv.total.toFixed(2)}€` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Item detail for first invoice */}
                {invoices[0]?.items?.length > 0 && (
                  <div className="inv-items-section">
                    <h4 className="inv-items-title">Itens — {invoices[0].invoice_number}</h4>
                    <table className="inv-table inv-table-items">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th>Qtd</th>
                          <th>P. Unit.</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices[0].items.map((item, j) => (
                          <tr key={j}>
                            <td className="inv-td-desc">{item.description}</td>
                            <td>{item.quantity}</td>
                            <td className="inv-td-money">{item.unit_price.toFixed(2)}€</td>
                            <td className="inv-td-money">{item.total.toFixed(2)}€</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
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

  /* Product browser — light Papelaria da Vila theme */
  .product-browser {
    flex: 1;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 440px;
    color: #1a1a1a;
  }
  .pb-brand-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: #1a6fb5;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .pb-logo {
    height: 22px;
    width: auto;
    background: white;
    border-radius: 4px;
    padding: 2px 6px;
  }
  .pb-brand-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: white;
    letter-spacing: 0.02em;
  }
  .pb-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fafafa;
  }
  .pb-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .pb-search-icon {
    position: absolute;
    left: 10px;
    color: #999;
    pointer-events: none;
  }
  .pb-search {
    width: 100%;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 8px 12px 8px 32px;
    color: #1a1a1a;
    font-size: 0.82rem;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
  }
  .pb-search::placeholder { color: #aaa; }
  .pb-search:focus { border-color: #1a6fb5; }
  .pb-filters {
    display: flex;
    gap: 6px;
  }
  .pb-select {
    flex: 1;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 6px 8px;
    color: #1a1a1a;
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
    -webkit-appearance: none;
  }
  .pb-select:focus { border-color: #1a6fb5; }
  .pb-select option { background: #fff; color: #1a1a1a; }
  .pb-count {
    padding: 6px 16px;
    font-size: 0.72rem;
    color: #888;
    letter-spacing: 0.04em;
    background: #fafafa;
  }
  .pb-grid {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 12px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    align-content: start;
    background: #f5f5f5;
  }
  .pb-grid::-webkit-scrollbar { width: 4px; }
  .pb-grid::-webkit-scrollbar-track { background: transparent; }
  .pb-grid::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }
  .pb-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px;
    transition: all 0.2s;
  }
  .pb-card:hover {
    border-color: #1a6fb5;
    box-shadow: 0 4px 12px rgba(26, 111, 181, 0.1);
    transform: translateY(-2px);
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
    color: #1a6fb5;
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
  .pb-stock.in { background: rgba(34,197,94,0.1); color: #16a34a; }
  .pb-stock.out { background: rgba(239,68,68,0.1); color: #dc2626; }
  .pb-name {
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.35;
    margin: 0 0 8px;
    color: #333;
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
    color: #1a1a1a;
  }
  .pb-stock-num {
    font-size: 0.68rem;
    color: #999;
  }

  /* Product detail — light theme */
  .pb-detail {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    position: relative;
    background: #fff;
  }
  .pb-detail-close {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid #ddd;
    background: #fff;
    color: #888;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 2;
  }
  .pb-detail-close:hover {
    color: #fff;
    border-color: #1a6fb5;
    background: #1a6fb5;
  }
  .pb-detail-img-wrap {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    border-radius: 10px;
    margin-bottom: 16px;
    overflow: hidden;
    border: 1px solid #eee;
  }
  .pb-detail-img {
    max-height: 140px;
    max-width: 90%;
    object-fit: contain;
  }
  .pb-detail-img-fallback {
    max-height: 50px;
    opacity: 0.4;
  }
  .pb-detail-info { display: flex; flex-direction: column; gap: 8px; }
  .pb-detail-name {
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.3;
    margin: 4px 0 0;
    color: #1a1a1a;
  }
  .pb-detail-desc {
    font-size: 0.82rem;
    line-height: 1.5;
    color: #666;
    margin: 0;
  }
  .pb-detail-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid #eee;
    border-bottom: 1px solid #eee;
  }
  .pb-detail-meta-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pb-detail-meta-label {
    font-size: 0.72rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pb-detail-meta-value {
    font-size: 0.78rem;
    color: #444;
    text-align: right;
    max-width: 60%;
  }
  .pb-detail-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 4px;
  }
  .pb-detail-prices {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .pb-detail-price {
    font-size: 1.3rem;
    font-weight: 700;
    color: #1a6fb5;
  }
  .pb-detail-price-net {
    font-size: 0.75rem;
    color: #999;
  }
  .pb-detail-stock-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Browser Tabs ── */
  .pb-tabs {
    display: flex;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    padding: 0;
  }
  .pb-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 9px 8px;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.72rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
    letter-spacing: 0.02em;
  }
  .pb-tab:hover { color: #555; background: #eee; }
  .pb-tab.active {
    color: #1a6fb5;
    border-bottom-color: #1a6fb5;
    background: #fff;
  }
  .pb-tab svg { flex-shrink: 0; }

  /* ── Tab: Financeiro ── */
  .pb-fin {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pb-fin::-webkit-scrollbar { width: 4px; }
  .pb-fin::-webkit-scrollbar-track { background: transparent; }
  .pb-fin::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }
  .pb-fin-kpis {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .pb-fin-kpi {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pb-fin-kpi-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: #1a6fb5;
    letter-spacing: -0.01em;
  }
  .pb-fin-kpi-label {
    font-size: 0.65rem;
    color: #888;
    letter-spacing: 0.02em;
  }
  .pb-fin-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .pb-fin-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px;
  }
  .pb-fin-card-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: #333;
    margin: 0 0 10px;
    letter-spacing: 0.01em;
  }
  .pb-fin-stat-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .pb-fin-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pb-fin-stat-label {
    font-size: 0.7rem;
    color: #666;
  }
  .pb-fin-stat-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: #333;
  }
  .pb-fin-green { color: #16a34a !important; }
  .pb-fin-red { color: #dc2626 !important; }
  .pb-fin-kpi-accent { color: #EF4823 !important; }
  .pb-fin-divider { padding-top: 7px; border-top: 1px solid #eee; }
  .pb-fin-total {
    padding-top: 7px;
    border-top: 2px solid #e0e0e0;
  }
  .pb-fin-total .pb-fin-stat-label { font-weight: 700; color: #333; }
  .pb-fin-total .pb-fin-stat-value { font-size: 0.82rem; }

  /* ── Tab: Análises ── */
  .pb-ana {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pb-ana::-webkit-scrollbar { width: 4px; }
  .pb-ana::-webkit-scrollbar-track { background: transparent; }
  .pb-ana::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }

  /* KPI row */
  .pb-ana-kpis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pb-ana-kpi {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
  }
  .pb-ana-kpi-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: #1a6fb5;
  }
  .pb-ana-kpi-label {
    font-size: 0.6rem;
    color: #888;
  }
  .pb-ana-kpi-trend {
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 4px;
  }
  .pb-ana-trend-up { background: rgba(22,163,74,0.1); color: #16a34a; }
  .pb-ana-trend-down { background: rgba(220,38,38,0.1); color: #dc2626; }

  .pb-ana-section {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px;
  }
  .pb-ana-title {
    font-size: 0.72rem;
    font-weight: 700;
    color: #333;
    margin: 0 0 8px;
    letter-spacing: 0.01em;
  }

  /* Bar chart (horizontal) */
  .pb-ana-bars {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pb-ana-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pb-ana-bar-label {
    font-size: 0.62rem;
    color: #666;
    width: 85px;
    flex-shrink: 0;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pb-ana-bar-track {
    flex: 1;
    height: 12px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;
  }
  .pb-ana-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
    min-width: 4px;
  }
  .pb-ana-bar-blue { background: #1a6fb5; }
  .pb-ana-bar-orange { background: #EF4823; }
  .pb-ana-bar-green { background: #16a34a; }
  .pb-ana-bar-value {
    font-size: 0.62rem;
    font-weight: 700;
    color: #444;
    width: 30px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Vertical bar chart (monthly revenue) */
  .pb-ana-chart {
    display: flex;
    gap: 4px;
    align-items: flex-end;
    height: 80px;
    padding-top: 4px;
  }
  .pb-ana-chart-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
  }
  .pb-ana-chart-bar-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .pb-ana-chart-bar {
    width: 100%;
    max-width: 20px;
    background: #1a6fb5;
    border-radius: 3px 3px 0 0;
    transition: height 0.4s ease;
    min-height: 3px;
  }
  .pb-ana-chart-label {
    font-size: 0.55rem;
    color: #999;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .pb-ana-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .pb-ana-half { margin: 0; }

  /* Mini stats under channels */
  .pb-ana-mini-stats {
    display: flex;
    gap: 12px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #eee;
  }
  .pb-ana-mini {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .pb-ana-mini-label {
    font-size: 0.58rem;
    color: #999;
  }
  .pb-ana-mini-value {
    font-size: 0.82rem;
    font-weight: 700;
    color: #1a6fb5;
  }

  /* Sellers performance */
  .pb-ana-sellers {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pb-ana-seller {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pb-ana-seller-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pb-ana-seller-name {
    font-size: 0.68rem;
    font-weight: 600;
    color: #333;
  }
  .pb-ana-seller-pct {
    font-size: 0.62rem;
    font-weight: 700;
    color: #1a6fb5;
  }
  .pb-ana-seller-bar-track {
    height: 6px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;
  }
  .pb-ana-seller-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .pb-ana-seller-good { background: #16a34a; }
  .pb-ana-seller-warn { background: #eab308; }
  .pb-ana-seller-nums {
    display: flex;
    justify-content: space-between;
    font-size: 0.58rem;
    color: #888;
  }
  .pb-ana-seller-target { color: #bbb; }

  /* ── Slide: Invoice Scanner ── */
  .slide-invoices-inner {
    max-width: 1100px;
    display: flex;
    gap: 28px;
    align-items: flex-start;
  }
  .inv-left {
    flex: 0 0 320px;
    padding-top: 4px;
  }
  .inv-right {
    flex: 1;
    min-width: 0;
  }

  /* Drop zone */
  .inv-dropzone {
    border: 2px dashed rgba(255,255,255,0.15);
    border-radius: var(--radius);
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.25s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .inv-dropzone:hover, .inv-dropzone-active {
    border-color: var(--accent);
    background: rgba(239, 72, 35, 0.04);
  }
  .inv-dropzone-has-files {
    padding: 14px;
    border-style: solid;
    border-color: rgba(255,255,255,0.1);
  }
  .inv-drop-icon { color: var(--text-muted); }
  .inv-drop-text {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text);
  }
  .inv-drop-sub {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  /* File list */
  .inv-file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .inv-file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .inv-file-thumb {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .inv-file-name {
    flex: 1;
    font-size: 0.75rem;
    color: var(--text);
  }
  .inv-file-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .inv-file-remove:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

  /* Mobile capture */
  .inv-mobile-capture {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }
  .inv-mobile-confirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }
  .inv-mobile-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }
  .inv-mobile-btn:hover { background: var(--accent-hover); }
  .inv-mobile-btn-sec {
    background: rgba(255,255,255,0.06);
    color: var(--text);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .inv-mobile-btn-sec:hover { background: rgba(255,255,255,0.1); }

  /* Actions */
  .inv-actions { margin-bottom: 10px; }
  .inv-parse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }
  .inv-parse-btn:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
  .inv-parse-btn:disabled { opacity: 0.7; cursor: wait; }
  .inv-error {
    font-size: 0.78rem;
    color: #ef4444;
    margin: 8px 0 0;
  }

  /* Spinner */
  .inv-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: inv-spin 0.6s linear infinite;
  }
  @keyframes inv-spin { to { transform: rotate(360deg); } }

  /* Done state */
  .inv-done {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }
  .inv-done-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(22,163,74,0.1);
    border: 1px solid rgba(22,163,74,0.2);
    border-radius: 10px;
    color: #4ade80;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .inv-reset-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
    width: fit-content;
  }
  .inv-reset-btn:hover { color: var(--text); border-color: var(--accent); }

  /* Browser / table panel */
  .inv-browser {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 420px;
    color: #1a1a1a;
  }
  .inv-browser-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #1a6fb5;
    color: white;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .inv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 20px;
    color: #aaa;
    font-size: 0.78rem;
  }

  /* Loading animation */
  .inv-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px 20px;
  }
  .inv-loading-anim {
    width: 120px;
    height: 80px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    background: #fafafa;
  }
  .inv-scan-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #1a6fb5;
    box-shadow: 0 0 8px rgba(26,111,181,0.5);
    animation: inv-scan 1.5s ease-in-out infinite;
  }
  @keyframes inv-scan {
    0%, 100% { top: 0; }
    50% { top: calc(100% - 2px); }
  }
  .inv-loading-text {
    font-size: 0.82rem;
    font-weight: 600;
    color: #555;
  }
  .inv-loading-steps {
    display: flex;
    gap: 16px;
  }
  .inv-step {
    font-size: 0.68rem;
    color: #ccc;
    transition: color 0.3s;
  }
  .inv-step.active { color: #1a6fb5; font-weight: 600; }

  /* Table */
  .inv-table-wrap {
    flex: 1;
    overflow: auto;
    padding: 0;
  }
  .inv-table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
  .inv-table-wrap::-webkit-scrollbar-track { background: transparent; }
  .inv-table-wrap::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .inv-table th {
    background: #f5f5f5;
    padding: 8px 10px;
    text-align: left;
    font-weight: 700;
    color: #555;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 2px solid #e8e8e8;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .inv-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
    vertical-align: top;
  }
  .inv-table tbody tr:hover { background: #f8fbff; }
  .inv-td-num { font-weight: 700; color: #1a6fb5; white-space: nowrap; }
  .inv-td-client { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inv-td-nif { font-family: monospace; font-size: 0.68rem; color: #666; white-space: nowrap; }
  .inv-td-money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .inv-td-total { font-weight: 700; text-align: right; white-space: nowrap; color: #1a1a1a; }
  .inv-vat-rate { font-size: 0.58rem; color: #999; }
  .inv-td-desc { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Items detail */
  .inv-items-section {
    border-top: 2px solid #e8e8e8;
    padding-top: 8px;
  }
  .inv-items-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: #555;
    padding: 6px 10px 0;
    margin: 0;
  }
  .inv-table-items th { background: #fafafa; }

  /* ── Password gate ── */
  .pw-gate {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .pw-card {
    text-align: center;
    max-width: 380px;
    width: 100%;
  }
  .pw-logo {
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .pw-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0 0 32px;
  }
  .pw-title {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0 0 8px;
    letter-spacing: -0.02em;
  }
  .pw-desc {
    font-size: 0.92rem;
    color: var(--text-muted);
    margin: 0 0 28px;
  }
  .pw-form {
    display: flex;
    gap: 8px;
  }
  .pw-input {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    color: var(--text);
    font-size: 0.92rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }
  .pw-input::placeholder { color: var(--text-muted); }
  .pw-input:focus { border-color: var(--accent); }
  .pw-input-error { border-color: #ef4444; }
  .pw-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 12px 24px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .pw-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }
  .pw-error {
    font-size: 0.8rem;
    color: #ef4444;
    margin: 12px 0 0;
  }
  .pw-conf {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin: 32px 0 0;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* ── Slide: Workflow Demo ── */
  .slide-workflow { position: relative; }
  .slide-workflow-inner {
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }
  .wf-header { text-align: center; }
  .wf-header .slide-desc { max-width: 540px; margin: 0 auto 0; }

  .wf-windows {
    display: grid;
    grid-template-columns: 1fr 40px 1fr 40px 1fr;
    align-items: center;
    gap: 0;
    width: 100%;
  }

  .wf-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .wf-window {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition: opacity 0.4s, transform 0.4s;
  }
  .wf-window-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* ── WhatsApp Phone ── */
  .wf-phone-frame {
    width: 100%;
    max-width: 260px;
    background: #0b141a;
    border-radius: 20px;
    overflow: hidden;
    border: 2px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    transition: border-color 0.4s;
  }
  .wf-sent .wf-phone-frame {
    border-color: #25D366;
    box-shadow: 0 8px 32px rgba(37,211,102,0.15);
  }
  .wf-phone-status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 14px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #e9edef;
    background: #1f2c34;
  }
  .wf-phone-status-icons {
    display: flex;
    gap: 4px;
    color: #e9edef;
  }
  .wf-wa-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background: #1f2c34;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .wf-wa-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #1a6fb5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
  }
  .wf-wa-header-info { display: flex; flex-direction: column; }
  .wf-wa-name { font-size: 0.78rem; font-weight: 600; color: #e9edef; }
  .wf-wa-status { font-size: 0.6rem; color: #25D366; }

  .wf-wa-date {
    text-align: center;
    padding: 8px 0 4px;
    background: #0b141a;
  }
  .wf-wa-date span {
    background: #1f2c34;
    color: rgba(233,237,239,0.6);
    font-size: 0.58rem;
    padding: 3px 10px;
    border-radius: 6px;
    font-weight: 500;
  }

  .wf-wa-messages {
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: #0b141a;
    max-height: 220px;
    overflow-y: auto;
  }
  .wf-wa-msg {
    max-width: 88%;
    padding: 6px 8px;
    border-radius: 8px;
    position: relative;
  }
  .wf-wa-msg p {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.4;
    color: #e9edef;
  }
  .wf-wa-msg-sent {
    align-self: flex-end;
    background: #005c4b;
    border-bottom-right-radius: 2px;
  }
  .wf-wa-msg-recv {
    align-self: flex-start;
    background: #1f2c34;
    border-bottom-left-radius: 2px;
  }
  .wf-wa-time {
    display: block;
    text-align: right;
    font-size: 0.52rem;
    color: rgba(233,237,239,0.45);
    margin-top: 2px;
  }

  .wf-wa-bottom {
    padding: 8px 10px;
    background: #1f2c34;
    display: flex;
    justify-content: center;
  }
  .wf-wa-send-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background: #25D366;
    color: white;
    border: none;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }
  .wf-wa-send-btn:hover {
    background: #1ebe5b;
    transform: scale(1.03);
  }
  .wf-wa-sent-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #25D366;
  }

  /* ── WebApp Window ── */
  .wf-webapp-frame {
    width: 100%;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    color: #1a1a1a;
    min-height: 340px;
    transition: border-color 0.4s;
  }
  .wf-active .wf-webapp-frame {
    border-color: #1a6fb5;
    box-shadow: 0 8px 32px rgba(26,111,181,0.15);
  }
  .wf-webapp-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }
  .wf-webapp-dots {
    display: flex;
    gap: 5px;
  }
  .wf-dot-r, .wf-dot-y, .wf-dot-g {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .wf-dot-r { background: #ff5f56; }
  .wf-dot-y { background: #ffbd2e; }
  .wf-dot-g { background: #27c93f; }
  .wf-webapp-url {
    font-size: 0.62rem;
    color: #888;
    background: #fff;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
    flex: 1;
    text-align: center;
  }
  .wf-webapp-nav {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e0e0e0;
    background: #fafafa;
  }
  .wf-webapp-nav-item {
    padding: 8px 14px;
    font-size: 0.68rem;
    font-weight: 600;
    color: #999;
    border-bottom: 2px solid transparent;
    cursor: default;
  }
  .wf-webapp-nav-item.active {
    color: #1a6fb5;
    border-bottom-color: #1a6fb5;
  }
  .wf-webapp-body {
    flex: 1;
    padding: 14px;
    display: flex;
    flex-direction: column;
    min-height: 230px;
  }
  .wf-webapp-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #ccc;
    font-size: 0.72rem;
  }

  .wf-webapp-order {
    background: #f9fafb;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .wf-webapp-order-entering {
    animation: wfSlideIn 0.5s ease forwards;
  }
  @keyframes wfSlideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .wf-webapp-order-ready {
    border-color: #1a6fb5;
    background: rgba(26,111,181,0.03);
  }
  .wf-webapp-order-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wf-webapp-order-badge {
    font-size: 0.55rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    background: #25D366;
    color: white;
    letter-spacing: 0.04em;
  }
  .wf-webapp-order-id {
    font-size: 0.78rem;
    font-weight: 700;
    color: #333;
  }
  .wf-webapp-order-date {
    font-size: 0.6rem;
    color: #999;
    margin-left: auto;
  }
  .wf-webapp-order-client {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #555;
  }
  .wf-webapp-order-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    border-top: 1px solid #eee;
    border-bottom: 1px solid #eee;
  }
  .wf-webapp-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.65rem;
    color: #666;
  }
  .wf-webapp-item span:last-child {
    font-weight: 700;
    color: #444;
    flex-shrink: 0;
    margin-left: 8px;
  }
  .wf-webapp-order-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .wf-webapp-total {
    font-size: 0.78rem;
    font-weight: 700;
    color: #1a6fb5;
  }
  .wf-webapp-ticket-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    font-weight: 600;
    color: #16a34a;
    background: rgba(22,163,74,0.08);
    padding: 3px 8px;
    border-radius: 4px;
    animation: wfFadeIn 0.3s ease;
  }
  @keyframes wfFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* ── Warehouse Tablet ── */
  .wf-tablet-frame {
    width: 100%;
    background: #fff;
    border-radius: 16px;
    overflow: hidden;
    border: 3px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    color: #1a1a1a;
    min-height: 340px;
    transition: border-color 0.4s;
  }
  .wf-active .wf-tablet-frame {
    border-color: #EF4823;
    box-shadow: 0 8px 32px rgba(239,72,35,0.12);
  }
  .wf-tablet-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #EF4823;
    color: white;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .wf-tablet-date {
    margin-left: auto;
    font-size: 0.65rem;
    font-weight: 500;
    opacity: 0.85;
  }
  .wf-tablet-body {
    flex: 1;
    padding: 14px;
    display: flex;
    flex-direction: column;
    min-height: 270px;
  }
  .wf-tablet-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #ccc;
    font-size: 0.72rem;
  }
  .wf-tablet-order {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .wf-tablet-order-appear {
    animation: wfSlideIn 0.5s ease forwards;
  }
  .wf-tablet-order-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .wf-tablet-priority {
    font-size: 0.62rem;
    font-weight: 800;
    padding: 4px 12px;
    border-radius: 6px;
    background: #EF4823;
    color: white;
    letter-spacing: 0.08em;
    animation: wfPulse 2s ease-in-out infinite;
  }
  @keyframes wfPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .wf-tablet-order-id {
    font-size: 0.88rem;
    font-weight: 700;
    color: #333;
  }
  .wf-tablet-client-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #eee;
  }
  .wf-tablet-client-info strong {
    font-size: 0.78rem;
    color: #333;
  }
  .wf-tablet-client-info span {
    font-size: 0.65rem;
    color: #888;
  }
  .wf-tablet-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wf-tablet-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #fafafa;
    border-radius: 6px;
    border: 1px solid #eee;
    font-size: 0.7rem;
    color: #555;
  }
  .wf-tablet-item strong {
    margin-left: auto;
    color: #333;
    flex-shrink: 0;
  }
  .wf-tablet-check {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 2px solid #ddd;
    flex-shrink: 0;
  }
  .wf-tablet-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.6rem;
    color: #999;
    padding-top: 6px;
    border-top: 1px solid #eee;
  }

  /* ── Reset button ── */
  .wf-reset-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }
  .wf-reset-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(239,72,35,0.06);
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
    .slide-invoices-inner { flex-direction: column; }
    .inv-left { flex: none; width: 100%; }
    .inv-right { width: 100%; }
    .inv-browser { max-height: 280px; }
    .wf-windows { grid-template-columns: 1fr; gap: 16px; }
    .wf-arrow { transform: rotate(90deg); }
  }
  @media (max-width: 480px) {
    .why-grid { grid-template-columns: 1fr; }
  }
`;
