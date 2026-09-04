/* UI chrome — Portuguese, the canonical language.
   This object's SHAPE is the contract: chrome.en.ts is typed against it, so
   a key missing or misspelled in English fails to compile, right there.
   No `as const`: that would narrow every value to its literal and force the
   English file to repeat the Portuguese verbatim. */

export const chromePt = {
  nav: {
    playground: "← Playground",
    eyebrow: "Informação pública · sem valor legal",
    langLabel: "Idioma",
  },
  footer: {
    lead: "Projeto educativo, construído a partir de informação pública.",
    noLegal: "Não tem valor legal",
    tail: "e não substitui aconselhamento fiscal. Cada número indica o ano e a fonte.",
    sources: "Fontes e metodologia",
  },
  flow: {
    carteira: "A tua carteira",
    estado: "O Estado",
    liquido: "Fica contigo",
    irs: "IRS",
    tsu: "Segurança Social",
    bruto: "bruto",
  },
  honesty: {
    yearChip: "(valores de {year})",
    source: "Fonte:",
    dataOf: "dados de {year} · verificado em {date}",
    unverifiedTitle: "Valores por verificar",
    unverifiedMissing: "Faltam dados de {list}.",
    unverifiedPending: "Os valores de {list} ainda não foram confirmados nas fontes oficiais.",
    unverifiedAdvice: "Não uses estes números para decisões — trata-os como ilustração.",
    disclaimerLead: "Estimativa construída a partir de informação pública.",
    disclaimerNoLegal: "Não tem valor legal",
    disclaimerTail: "e não substitui aconselhamento fiscal nem a tua declaração de IRS.",
  },
  inputs: {
    less: "Menos um: {label}",
    more: "Mais um: {label}",
  },
  loading: "A carregar os dados fiscais…",
  loadError: "Não foi possível carregar os dados fiscais. Tenta recarregar a página.",
  home: {
    eyebrow: "Literacia Financeira Portuguesa",
    title: "O teu dinheiro, explicado sem dores de cabeça.",
    lede: "IRS, IVA, IRC, Segurança Social e inflação — em português simples, com calculadoras e números que podes verificar.",
    flowTitle: "Para onde vai um salário de {amount}",
    presetsLabel: "Escolher salário bruto mensal",
    colDestino: "Destino",
    colValor: "Valor",
    colPeso: "Peso",
    tableCaption: "Repartição de um salário bruto de {amount}",
    flowAria:
      "De {bruto} de salário bruto: {liquido} ficam na carteira, {irs} vão para o IRS e {tsu} para a Segurança Social.",
    assumptions:
      "Solteiro, sem dependentes, Continente, sem subsídio de refeição. A retenção é um adiantamento mensal — o acerto faz-se na declaração anual.",
    calcYours: "Calcular o teu caso",
    doors: [
      {
        href: "/lfp/individual",
        eyebrow: "Para ti",
        title: "Individual",
        body: "O que sai do teu salário, para onde vai, e o que sobra ao fim do mês.",
        items: ["IRS explicado", "Salário líquido", "Segurança Social", "Recibos verdes"],
      },
      {
        href: "/lfp/empresarial",
        eyebrow: "Para empresas",
        title: "Empresarial",
        body: "Quanto custa mesmo um trabalhador, e como funcionam o IVA e o IRC.",
        items: ["Custo real de um salário", "IVA", "IRC", "Derramas"],
      },
      {
        href: "/lfp/economia",
        eyebrow: "Contexto",
        title: "Economia",
        body: "Inflação, poder de compra, e como Portugal se compara lá fora.",
        items: ["Máquina do tempo", "Onde te situas", "Dias de trabalho", "Onde vão os impostos"],
      },
    ],
    quizEyebrow: "Testa-te",
    quizTitle: "Quão boa é a tua literacia financeira?",
    quizBody: "Perguntas rápidas de escolha múltipla, com explicação e fonte em cada resposta.",
    quizCta: "Começar →",
  },
  individual: {
    crumb: "Individual",
    eyebrow: "Para ti",
    title: "O que sai do teu salário, e para onde vai.",
    lede: "Cada mês, antes de veres o dinheiro, saem duas fatias: uma para o IRS, outra para a Segurança Social. Aqui explicamos as duas e deixamos-te fazer as contas ao teu caso.",
    kindExplicacao: "Explicação",
    kindCalculadora: "Calculadora",
    soon: "Em breve",
    topicsAria: "Temas",
    topics: {
      salarioLiquido: {
        title: "Salário líquido",
        body: "Do bruto ao que entra na conta: IRS, Segurança Social, subsídio de refeição, dependentes.",
      },
      irs: {
        title: "IRS",
        body: "O que é, porque é progressivo, e porque subir de escalão nunca te faz ganhar menos.",
      },
      tsu: {
        title: "Segurança Social",
        body: "Os 11% que descontas todos os meses: para onde vão e o que te dão em troca.",
      },
      recibosVerdes: {
        title: "Recibos verdes ou contrato?",
        body: "O mesmo valor bruto pelas duas vias — o que sobra e o que perdes em proteção.",
      },
      cenarios: {
        title: "Comparar cenários",
        body: "Emprego atual contra proposta nova, lado a lado, com o mesmo cálculo.",
      },
    },
  },
};

export type ChromeDict = typeof chromePt;
