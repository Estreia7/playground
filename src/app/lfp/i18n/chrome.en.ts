import type { ChromeDict } from "./chrome.pt";

/* Typed against the Portuguese shape: a key missing here is a compile error
   pointing at this file and this property. */
export const chromeEn: ChromeDict = {
  nav: {
    playground: "← Playground",
    eyebrow: "Public information · no legal standing",
    langLabel: "Language",
  },
  footer: {
    lead: "An educational project built from public information.",
    noLegal: "It has no legal standing",
    tail: "and is not a substitute for tax advice. Every figure states its year and source.",
    sources: "Sources and method",
  },
  flow: {
    carteira: "Your wallet",
    estado: "The State",
    liquido: "You keep",
    irs: "Income tax (IRS)",
    tsu: "Social Security",
    bruto: "gross",
    custoTotal: "total cost",
    precoComIva: "price with VAT",
    lucroTributavel: "taxable profit",
  },
  honesty: {
    yearChip: "({year} figures)",
    source: "Source:",
    dataOf: "{year} data · checked on {date}",
    unverifiedTitle: "Figures awaiting verification",
    unverifiedMissing: "No data yet for {list}.",
    unverifiedPending: "The {list} figures have not yet been confirmed against official sources.",
    unverifiedAdvice: "Don't base decisions on these numbers — treat them as illustration.",
    disclaimerLead: "An estimate built from public information.",
    disclaimerNoLegal: "It has no legal standing",
    disclaimerTail: "and is no substitute for tax advice or your own tax return.",
  },
  inputs: {
    less: "One less: {label}",
    more: "One more: {label}",
  },
  loading: "Loading tax data…",
  loadError: "The tax data could not be loaded. Try reloading the page.",
  home: {
    eyebrow: "Portuguese Financial Literacy",
    title: "Your money, explained without the headache.",
    lede: "Income tax, VAT, corporate tax, Social Security and inflation — in plain language, with calculators and numbers you can check.",
    flowTitle: "Where a {amount} salary goes",
    presetsLabel: "Choose a gross monthly salary",
    colDestino: "Where",
    colValor: "Amount",
    colPeso: "Share",
    tableCaption: "Breakdown of a {amount} gross salary",
    flowAria:
      "From {bruto} gross: {liquido} stays in your wallet, {irs} goes to income tax and {tsu} to Social Security.",
    assumptions:
      "Single, no dependants, mainland Portugal, no meal allowance. Withholding is a monthly advance — the final settlement happens on the annual return.",
    calcYours: "Calculate your own",
    doors: [
      {
        href: "/lfp/individual",
        eyebrow: "For you",
        title: "Individual",
        body: "What leaves your salary, where it goes, and what is left at the end of the month.",
        items: ["Income tax explained", "Net salary", "Social Security", "Freelance vs. contract"],
      },
      {
        href: "/lfp/empresarial",
        eyebrow: "For businesses",
        title: "Business",
        body: "What an employee really costs, and how VAT and corporate tax work.",
        items: ["True cost of a salary", "VAT", "Corporate tax", "Surcharges"],
      },
      {
        href: "/lfp/economia",
        eyebrow: "Context",
        title: "Economy",
        body: "Inflation, purchasing power, and how Portugal compares abroad.",
        items: ["Time machine", "Where you stand", "Days of work", "Where taxes go"],
      },
    ],
    quizEyebrow: "Test yourself",
    quizTitle: "How good is your financial literacy?",
    quizBody: "Quick multiple-choice questions, with an explanation and a source for every answer.",
    quizCta: "Start →",
  },
  individual: {
    crumb: "Individual",
    eyebrow: "For you",
    title: "What leaves your salary, and where it goes.",
    lede: "Every month, before you see the money, two slices come off: one for income tax, one for Social Security. Here we explain both and let you run the numbers for your own case.",
    kindExplicacao: "Explainer",
    kindCalculadora: "Calculator",
    soon: "Coming soon",
    topicsAria: "Topics",
    topics: {
      salarioLiquido: {
        title: "Net salary",
        body: "From gross to what lands in your account: income tax, Social Security, meal allowance, dependants.",
      },
      irs: {
        title: "Income tax (IRS)",
        body: "What it is, why it is progressive, and why moving up a bracket never leaves you with less.",
      },
      tsu: {
        title: "Social Security",
        body: "The 11% you pay every month: where it goes and what you get back.",
      },
      recibosVerdes: {
        title: "Freelance or contract?",
        body: "The same gross amount both ways — what is left and what you give up in protection.",
      },
      cenarios: {
        title: "Compare scenarios",
        body: "Current job against a new offer, side by side, with the same maths.",
      },
    },
  },
};
