import Link from "next/link";

const experiments = [
  {
    title: "Getting Started",
    description: "This is your playground — add experiments, presentations, and feature tests here.",
    href: "#",
    status: "info" as const,
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
              className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold tracking-tight group-hover:text-white">
                  {exp.title}
                </h3>
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
                  {exp.status}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-500">
                {exp.description}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
