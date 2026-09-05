import type { ExplainersDict } from "./explainers.pt";

export const explainersEn: ExplainersDict = {
  common: {
    sourcesTitle: "Sources",
    bracketsTitle: "The withholding tables, with your salary",
    bracketsSalary: "Gross monthly salary",
    bracketsUpTo: "Up to",
    bracketsAbove: "Above",
    bracketsMarginal: "Marginal rate",
    bracketsParcela: "Deductible amount",
    bracketsFormula: "formula",
    bracketsYours: "your bracket",
    bracketsMarginalIs: "Marginal rate: {rate} — only on what you earn above the previous bracket.",
    bracketsEffectiveIs: "Effective rate: {rate} — what you actually pay, on average, on the total.",
    bracketsProof: "Try {below} and then {above}. Net pay goes up. Moving up a bracket never leaves you with less.",
    annualTitle: "The annual brackets",
    annualFrom: "From",
    annualTo: "to",
    annualRate: "Rate",
    tsuSplitTitle: "Who pays what, on {amount} gross",
    tsuSplitWorker: "You, deducted from your salary",
    tsuSplitEmployer: "The company, on top of your salary",
    tsuSplitTotal: "Total to Social Security",
    tsuSplitOn: "on a gross of",
  },

  irs: {
    crumb: "Income tax",
    eyebrow: "Explainer",
    title: "IRS: the tax on what you earn.",
    lede: "It's the biggest slice that leaves your salary, and the most misunderstood. Here's the essential, without jargon, and a table where you can see your own case.",
    tldrTitle: "In 30 seconds",
    tldr: [
      "IRS is the tax on the income you earn in a year: salary, pensions, rent, freelance work.",
      "It's progressive by brackets: the more you earn, the higher the rate — but each rate only applies to the slice that falls in that bracket.",
      "What leaves your payslip every month is withholding: an advance, not the final tax.",
      "The settlement happens on the annual return. If too much was withheld, you get it back; if too little, you pay the difference.",
      "Moving up a bracket never leaves you with less. Never.",
    ],
    sections: [
      {
        id: "o-que-e",
        heading: "What it is, exactly",
        blocks: [
          {
            t: "p",
            text: "IRS stands for Imposto sobre o Rendimento das Pessoas Singulares — personal income tax. It's the tax the State charges on the money a person earns over a year: salary, but also pensions, rent from a flat you let, or what you invoice if you work for yourself.",
          },
          {
            t: "p",
            text: "This page covers the most common case: the salary of someone employed by a company. The law calls it category A income, and it's what the net salary calculator simulates.",
          },
          {
            t: "callout",
            title: "One idea that changes everything",
            text: "IRS is not charged on what you earn in a month — it's charged on what you earn in a year. Everything that happens month to month is an approximation of that yearly figure.",
          },
        ],
      },
      {
        id: "progressivo",
        heading: "Why it's progressive, and what that means",
        blocks: [
          {
            t: "p",
            text: "Income is split into brackets, and each bracket has its own rate. The first slice pays the lowest rate, the next slice pays the next rate, and so on. The highest rate that touches you only applies to the part of your income above the last threshold.",
          },
          {
            t: "p",
            text: "That's why the same person has two different rates. The marginal rate is the one for the last bracket you enter — what you pay on the next euro. The effective rate is the average of what you pay on the total, and it's always lower than the marginal.",
          },
          {
            t: "callout",
            title: "The myth",
            text: "\"If I move up a bracket, I'll end up with less.\" It's false, and it costs money to people who believe it — some turn down raises because of it. The new rate only touches what you earn above the threshold. Try it in the table below: enter a value just below a threshold, then just above. Net pay always goes up.",
          },
        ],
        widget: "brackets",
      },
      {
        id: "retencao",
        heading: "Withholding: the monthly advance",
        blocks: [
          {
            t: "p",
            text: "The State doesn't wait until year end to collect. Every month your employer withholds part of your salary and hands it to the tax office on your behalf. That amount is called withholding at source, and it's calculated with tables published every year.",
          },
          {
            t: "steps",
            items: [
              {
                title: "Find the bracket",
                text: "The month's gross salary is looked up in the right table — there are different tables for unmarried, married with one or two earners, and for people with dependants.",
              },
              {
                title: "Apply the marginal rate",
                text: "The gross is multiplied by that bracket's marginal rate. On its own this would be too much, because it taxes the whole base at the highest rate.",
              },
              {
                title: "Subtract the deductible amount",
                text: "So a fixed amount per bracket is subtracted, correcting exactly that excess. That's how progressivity fits in a single line of arithmetic.",
              },
              {
                title: "Subtract for dependants",
                text: "For each dependant, a further amount comes off the withholding. The result never goes below zero.",
              },
            ],
          },
          {
            t: "p",
            text: "In the first brackets above the minimum wage, the deductible amount isn't a fixed number — it's a formula that depends on the salary itself. It lets the tax come in gradually instead of appearing all at once on the first euro above the minimum.",
          },
          {
            t: "list",
            items: [
              "Holiday and Christmas bonuses are withheld separately, each at its own rate. They don't add to the month, and they don't push you into a higher bracket.",
              "The meal allowance pays no income tax up to a daily limit. Only what exceeds that limit counts.",
              "Withholding is an advance. Lower withholding isn't \"paying less tax\" — it's paying later.",
            ],
          },
        ],
      },
      {
        id: "acerto",
        heading: "The annual settlement: where it all gets resolved",
        blocks: [
          {
            t: "p",
            text: "Between April and June you file your tax return with what you earned the previous year. That's when the real tax is calculated, with the annual brackets and all the deductions, and compared with what was already withheld month by month.",
          },
          {
            t: "p",
            text: "Before applying the rates, the State removes a specific deduction from your income — a fixed yearly amount that recognises that working has costs. Then, from the tax calculated, it subtracts tax credits: a share of what you spent on health, education, housing, and of the invoices you requested with your tax number.",
          },
          {
            t: "callout",
            title: "A refund is not a prize",
            text: "Getting a refund in May means that over the year more was withheld than you owed. It was your money, lent to the State interest-free. It's neither good nor bad — it's just the settlement.",
          },
          {
            t: "p",
            text: "There's also a subsistence minimum: a yearly income below which no income tax is paid, so that nobody drops below a certain level because of the tax. In 2026 it matches the minimum wage over 14 months.",
          },
        ],
      },
      {
        id: "nao-cobre",
        heading: "What this site doesn't cover (yet)",
        blocks: [
          {
            t: "list",
            items: [
              "IRS Jovem — the reduction for people starting their working life. It changes the maths significantly in the first years.",
              "Non-habitual residents and special regimes.",
              "Other income categories: rent, capital gains, freelance work. The freelance calculator will handle the last one.",
              "The Madeira and Azores tables, which differ from the mainland's.",
            ],
          },
        ],
      },
    ],
    faqTitle: "Questions everyone asks",
    faq: [
      {
        q: "I got a raise and my net went up by less than the gross. Was I robbed?",
        a: "No. Every extra euro of the raise is taxed at your marginal rate, the highest one that touches you. If the marginal is 31%, of a €100 raise about €69 remain — minus the 11% Social Security that also comes off. Net always goes up; it just goes up by less than gross.",
      },
      {
        q: "Can I ask for less to be withheld and keep more per month?",
        a: "You can ask for more to be withheld — never less than the table says. And withholding more only means a bigger refund next year. The final tax is the same.",
      },
      {
        q: "I'm married. Do I pick \"one earner\" or \"two earners\"?",
        a: "Two earners if you both have income; one earner if only one of you does. The two-earner table is the same as the one for unmarried people without dependants — only the per-dependant amount differs.",
      },
      {
        q: "Is it worth declaring dependants to my employer?",
        a: "Yes. Each dependant lowers the monthly withholding, so you have more money in hand through the year instead of receiving it all as a refund.",
      },
    ],
    next: {
      label: "Up next",
      title: "Social Security: the other 11%",
      href: "/lfp/individual/tsu",
    },
  },

  tsu: {
    crumb: "Social Security",
    eyebrow: "Explainer",
    title: "Social Security: the 11% that isn't only yours.",
    lede: "A slice leaves your salary every month — and the company pays another, bigger one, that never shows on your payslip. It's a collective insurance. Here's what it buys.",
    tldrTitle: "In 30 seconds",
    tldr: [
      "You pay 11% of gross to Social Security. The company pays another 23.75% on top of your salary.",
      "Together that's 34.75% of gross: the Taxa Social Única.",
      "It isn't a tax — it's a contribution. It buys protection: retirement, sickness, unemployment, parental leave.",
      "Every month of contributions counts toward your contribution record, which determines your pension.",
    ],
    sections: [
      {
        id: "os-11",
        heading: "What the 11% is",
        blocks: [
          {
            t: "p",
            text: "The \"Segurança Social\" line on your payslip is 11% of gross salary. Unlike income tax, there are no brackets or tables: it's a single rate, the same for everyone employed by a company, and it comes off before any other calculation.",
          },
          {
            t: "p",
            text: "It applies to the salary and to the holiday and Christmas bonuses. It doesn't apply to the meal allowance up to the daily exempt limit — only to whatever exceeds it.",
          },
        ],
      },
      {
        id: "a-parte-que-nao-ves",
        heading: "The part you don't see: 23.75%",
        blocks: [
          {
            t: "p",
            text: "For every €100 of gross salary, the company pays another €23.75 to Social Security. It doesn't appear on your payslip because it doesn't come out of your salary — it comes out of the company's budget, on top of it. It's the main reason an employee costs far more than their gross.",
          },
          {
            t: "p",
            text: "Adding the two parts, 34.75% of your gross goes to Social Security every month. That's more than income tax on most salaries.",
          },
        ],
        widget: "tsuSplit",
      },
      {
        id: "o-que-compra",
        heading: "What you buy with it",
        blocks: [
          {
            t: "p",
            text: "Social Security is a collective insurance: those working today pay the benefits of those who need them today, and when they need them it will be those working then who pay theirs. It's called a pay-as-you-go system.",
          },
          {
            t: "list",
            items: [
              "Retirement — the old-age pension, calculated from the years and amounts you contributed.",
              "Sickness — the benefit when you're on sick leave, after a few days.",
              "Unemployment — if you lose your job through no choice of your own, with a minimum contribution period.",
              "Parental leave — maternity and paternity leave, paid by Social Security rather than the company.",
              "Disability and death — pensions for you if you become unable to work, or for your family.",
            ],
          },
          {
            t: "callout",
            title: "Contribution record",
            text: "Every month you contribute is recorded. That record — your carreira contributiva — is what determines whether you're entitled to each benefit, and how much. You can check it any time on Segurança Social Direta.",
          },
        ],
      },
      {
        id: "recibos-verdes",
        heading: "And freelancers?",
        blocks: [
          {
            t: "p",
            text: "The self-employed contribute too, but under different rules: the rate is different, and it applies to a share of what they invoice, not the total. And there's no company paying the 23.75% on top — that protection is thinner.",
          },
          {
            t: "p",
            text: "It's one of the real differences between a contract and freelance work at the same gross amount. The freelance calculator, when ready, puts the two side by side.",
          },
        ],
      },
    ],
    faqTitle: "Questions everyone asks",
    faq: [
      {
        q: "Does the 11% come off the meal allowance?",
        a: "Only off the part above the daily exempt limit. Up to that amount, the allowance contributes nothing to Social Security and pays no income tax.",
      },
      {
        q: "And off the holiday and Christmas bonuses?",
        a: "Yes, in full. They count as pay and contribute the same 11%.",
      },
      {
        q: "Can I see how much I've contributed?",
        a: "Yes, on Segurança Social Direta, the online portal. It shows your contribution record month by month and a pension simulation.",
      },
      {
        q: "Why is the company's share bigger than mine?",
        a: "It's a political choice: to put most of the cost on those who employ, not those who work. In practice, though, the company counts both amounts when deciding how much it can pay you.",
      },
    ],
    next: {
      label: "Up next",
      title: "Calculate your net salary",
      href: "/lfp/individual/salario-liquido",
    },
  },
};
