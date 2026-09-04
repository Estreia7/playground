import Link from "next/link";

const experiments = [
  {
    title: "LFP — Literacia Financeira Portuguesa",
    description:
      "Como funciona o dinheiro em Portugal: IRS, IVA, IRC e Segurança Social explicados, calculadoras animadas, inflação e comparação internacional.",
    href: "/lfp",
    status: "wip" as const,
    image: "/lfp-cover.svg",
  },
  {
    title: "Papelaria da Vila",
    description:
      "Interactive sales deck — tailored software solutions by Aekios. Multi-language presentation (PT/EN/ES).",
    href: "/presentations/papelaria-da-vila",
    status: "live" as const,
    image: "/papelaria-warehouse.png",
    logo: "/papelaria-logo.png",
  },
  {
    title: "Airbnb STR Scrapper",
    description:
      "Paste 1–15 Airbnb URLs, get a 12-month ADR table per listing. Playwright + stealth, SSE progress, Excel export.",
    href: "/airbnb-str-scrapper",
    status: "live" as const,
    image: "/airbnb-scrapper-cover.svg",
  },
  {
    title: "Host Analyzer",
    description:
      "Airbnb host intelligence: listings, AL licenses, RNT owners & insurance, operating-area map, ADR by segment, acquisition funnel, PDF dossiers.",
    href: "/host-analyzer",
    status: "live" as const,
    image: "/host-analyzer-cover.svg",
  },
  {
    title: "Monte Scan",
    description:
      "Scan documents & ID cards with your camera, auto-detect the type, crop & enhance, export to PDF, store, and share on WhatsApp.",
    href: "/monte-scan",
    status: "live" as const,
    image: "/monte-scan-cover.svg",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Playground<span className="text-zinc-500">.</span>
            </h1>
            <p className="text-sm text-zinc-500">Bruno Estreia — experiments & presentations</p>
          </div>
          <a
            href="https://bruno-dev.xyz"
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            Portfolio
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Experiments</h2>
          <p className="mt-2 text-zinc-500">
            Ideas, prototypes, and feature tests. Each card is a standalone experiment.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiments.map((exp) => (
            <Link
              key={exp.title}
              href={exp.href}
              className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition-all hover:border-zinc-700 hover:bg-zinc-900"
            >
              {exp.image && (
                <div className="relative h-40 w-full overflow-hidden">
                  <img
                    src={exp.image}
                    alt={exp.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {exp.logo && (
                    <div className="absolute bottom-3 left-3 rounded-lg bg-white px-2 py-1.5">
                      <img src={exp.logo} alt="" className="h-5 w-auto" />
                    </div>
                  )}
                </div>
              )}
              <div className="p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold tracking-tight group-hover:text-white">
                    {exp.title}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      exp.status === "live"
                        ? "bg-orange-600/20 text-orange-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {exp.status}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-zinc-500">
                  {exp.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
