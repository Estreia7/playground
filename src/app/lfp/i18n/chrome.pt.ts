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
    // Hub labels: what the figure at the split point actually IS.
    bruto: "bruto",
    custoTotal: "custo total",
    precoComIva: "preço com IVA",
    lucroTributavel: "lucro tributável",
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
  share: {
    title: "Partilhar este resultado",
    hint: "A ligação abre a mesma conta, com este cartão.",
    copy: "Copiar ligação",
    copied: "Ligação copiada",
    native: "Partilhar…",
    alt: "Cartão de partilha",
    // Copy printed ON the card image (server-rendered from the same dictionary).
    siteName: "Literacia Financeira Portuguesa",
    legalShort: "Sem valor legal",
    legalYear: "Dados de {year} · sem valor legal",
    sourceLabel: "Fonte:",
    cards: {
      salarioEyebrow: "De {bruto} de salário bruto, fica na tua conta",
      salarioSub: "por mês, solteiro, sem dependentes, Continente",
      effective: "Taxa efetiva de IRS",
      inflacaoEyebrow: "{amount} de {from} valem hoje",
      inflacaoSub: "em euros de {to}, pela subida de preços",
      priceRise: "Subida de preços",
      multiplier: "Multiplicador",
      diasEyebrow: "Em Portugal, {price} custam",
      day: "dia de trabalho",
      days: "dias de trabalho",
      diasSubPps: "de salário líquido médio, em poder de compra",
      diasSubEur: "de salário líquido médio, em euros nominais",
      daily: "Um dia de trabalho líquido",
      quizEyebrow: "Quiz de literacia financeira · {mode}",
      score: "Pontuação",
      quizSource: "Perguntas com fonte oficial, playground.bruno-dev.xyz/lfp",
    },
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
