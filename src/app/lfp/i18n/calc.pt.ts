/* Salário líquido calculator — Portuguese, canonical. See chrome.pt.ts for
   why there is no `as const`. */

export const calcPt = {
  salario: {
    crumb: "Salário líquido",
    eyebrow: "Calculadora",
    title: "Quanto do teu salário fica mesmo contigo?",
    lede: "Põe o bruto, ajusta a tua situação, e vê cada euro a seguir o seu caminho. A retenção de IRS é um adiantamento — o acerto final faz-se na declaração anual.",
    formAria: "Dados do teu salário",
    fields: {
      bruto: "Salário bruto mensal",
      brutoHint: "O valor antes de qualquer desconto.",
      meses: "Pagamentos por ano",
      meses14: "14 meses",
      meses12: "12 (duodécimos)",
      situacao: "Situação",
      naoCasado: "Não casado",
      casado2: "Casado, dois titulares",
      dependentes: "Dependentes",
      dependentesHint: "Cada dependente reduz o IRS retido.",
      subToggle: "Recebo subsídio de refeição",
      subMeio: "Pago em",
      subCartao: "Cartão",
      subDinheiro: "Dinheiro",
      subValor: "Valor por dia",
      subValorHint: "Isento até {amount} por dia.",
      subDias: "Dias por mês",
    },
    headline: {
      eyebrow: "Entra na tua conta, por mês",
      porAno: "Por ano",
      estado: "Vai para o Estado",
      taxaEfetiva: "Taxa efetiva de IRS",
      taxaMarginal: "Taxa marginal",
    },
    avisosAria: "Avisos",
    avisos: {
      "aviso.subsidio_excede_isencao":
        "O subsídio de refeição ultrapassa o limite isento — o excesso paga IRS e Segurança Social.",
      "aviso.tabela_indisponivel":
        "Ainda não temos a tabela de retenção para esta situação. O IRS aparece a zero.",
    },
    flowTitle: "Para onde vai cada euro",
    flowAria:
      "De {bruto}: {liquido} ficam na carteira, {irs} vão para o IRS e {tsu} para a Segurança Social.",
    ledger: {
      caption: "A conta, linha a linha",
      bruto: "Salário bruto",
      subIsento: "Subsídio de refeição (isento)",
      subTributado: "Subsídio de refeição (tributado)",
      tsu: "Segurança Social ({rate})",
      tsuPlain: "Segurança Social",
      irs: "IRS retido (escalão {rate})",
      irsPlain: "IRS retido",
      liquido: "Líquido mensal",
      anual: "Líquido anual ({n} pagamentos)",
    },
    notes: [
      "Só Continente. Madeira e Açores têm tabelas próprias.",
      "Não considera IRS Jovem, deficiência, residente não habitual nem outros rendimentos.",
      "Os subsídios de férias e de Natal são retidos à parte, com a sua própria taxa — não empurram o mês para um escalão superior.",
    ],
    readMore: "Queres perceber porque é que o IRS funciona assim?",
    readMoreLink: "Ler a explicação do IRS",
  },
};

export type CalcDict = typeof calcPt;
