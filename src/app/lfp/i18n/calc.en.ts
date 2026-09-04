import type { CalcDict } from "./calc.pt";

export const calcEn: CalcDict = {
  salario: {
    crumb: "Net salary",
    eyebrow: "Calculator",
    title: "How much of your salary actually stays with you?",
    lede: "Enter the gross, adjust your situation, and watch each euro take its path. Income-tax withholding is an advance — the final settlement happens on the annual return.",
    formAria: "Your salary details",
    fields: {
      bruto: "Gross monthly salary",
      brutoHint: "The amount before any deduction.",
      meses: "Payments per year",
      meses14: "14 months",
      meses12: "12 (spread out)",
      situacao: "Situation",
      naoCasado: "Not married",
      casado2: "Married, two earners",
      dependentes: "Dependants",
      dependentesHint: "Each dependant reduces the tax withheld.",
      subToggle: "I get a meal allowance",
      subMeio: "Paid by",
      subCartao: "Card",
      subDinheiro: "Cash",
      subValor: "Amount per day",
      subValorHint: "Tax-free up to {amount} a day.",
      subDias: "Days per month",
    },
    headline: {
      eyebrow: "Lands in your account, per month",
      porAno: "Per year",
      estado: "Goes to the State",
      taxaEfetiva: "Effective tax rate",
      taxaMarginal: "Marginal rate",
    },
    avisosAria: "Warnings",
    avisos: {
      "aviso.subsidio_excede_isencao":
        "The meal allowance exceeds the tax-free ceiling — the excess is subject to income tax and Social Security.",
      "aviso.tabela_indisponivel":
        "We don't have the withholding table for this situation yet. Income tax shows as zero.",
    },
    flowTitle: "Where each euro goes",
    flowAria:
      "From {bruto}: {liquido} stays in your wallet, {irs} goes to income tax and {tsu} to Social Security.",
    ledger: {
      caption: "The maths, line by line",
      bruto: "Gross salary",
      subIsento: "Meal allowance (tax-free)",
      subTributado: "Meal allowance (taxed)",
      tsu: "Social Security ({rate})",
      tsuPlain: "Social Security",
      irs: "Income tax withheld ({rate} bracket)",
      irsPlain: "Income tax withheld",
      liquido: "Net monthly",
      anual: "Net yearly ({n} payments)",
    },
    notes: [
      "Mainland Portugal only. Madeira and the Azores have their own tables.",
      "Does not model IRS Jovem, disability, non-habitual residency or other income.",
      "Holiday and Christmas bonuses are withheld separately at their own rate — they don't push the month into a higher bracket.",
    ],
    readMore: "Want to understand why income tax works this way?",
    readMoreLink: "Read the income tax explainer",
  },
};
