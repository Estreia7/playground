/* Economia branch — Portuguese, canonical. See chrome.pt.ts for why there
   is no `as const`. */

export const economiaPt = {
  hub: {
    crumb: "Economia",
    eyebrow: "Contexto",
    title: "O teu dinheiro no tempo, e no mapa.",
    lede: "O que um salário de há vinte anos vale hoje, para onde vão os teus impostos, quantos dias trabalhas para comprar o mesmo que um alemão. Tudo com dados oficiais, com o ano à vista.",
    topicsAria: "Temas",
    kindCalculadora: "Calculadora",
    soon: "Em breve",
    topics: {
      inflacao: {
        title: "Máquina do tempo",
        body: "Quanto vale hoje o que ganhavas em 1999? A inflação, com os números do Eurostat desde 1996.",
      },
      juros: {
        title: "Juros compostos",
        body: "O que 100 € por mês se tornam em 30 anos — e porque é que o tempo importa mais do que a taxa.",
      },
      impostos: {
        title: "Recibo do contribuinte",
        body: "Dos euros que entregas ao Estado todos os meses, quantos vão para a saúde, pensões, educação.",
      },
      dias: {
        title: "Dias de trabalho",
        body: "Quantos dias trabalhas para pagar algo — e quantos trabalha um espanhol, um alemão, um polaco.",
      },
      situas: {
        title: "Onde te situas",
        body: "Ganhas mais do que que percentagem dos portugueses? Com os escalões oficiais, sem falsa precisão.",
      },
    },
  },

  common: {
    year: "Ano",
    dataFrom: "Dados de {source}, {year}",
    retrieved: "obtidos em {date}",
  },

  inflacao: {
    crumb: "Máquina do tempo",
    eyebrow: "Calculadora",
    title: "Quanto vale hoje o dinheiro de {year}?",
    lede: "Mete um valor e um ano. A máquina diz-te o que esse dinheiro compra hoje — ou o que precisarias de ganhar hoje para viver como então.",
    formAria: "Valor e anos",
    fields: {
      amount: "Valor",
      fromYear: "No ano",
      toYear: "Vale, em",
      presets: "Anos de referência",
    },
    headline: {
      eyebrow: "{amount} de {from} valem, em {to}",
      cumulative: "Subida de preços",
      annualised: "Média por ano",
      factor: "Multiplicador",
      inverse: "{amount} de {to} valiam, em {from}",
    },
    chartTitle: "O índice de preços, {first}–{last}",
    chartAria: "Índice harmonizado de preços no consumidor em Portugal, de {first} a {last}, base 2015 igual a 100. Em {from} o índice era {idxFrom}; em {to}, {idxTo}.",
    tableTitle: "Inflação ano a ano",
    tableYear: "Ano",
    tableRate: "Inflação",
    tableIndex: "Índice",
    notes: [
      "Índice Harmonizado de Preços no Consumidor (Eurostat), não o IPC do INE — âmbito ligeiramente diferente, adequado para comparar poder de compra entre anos.",
      "É a média de todos os bens e serviços. A tua inflação pessoal depende do que compras: habitação e alimentação pesaram mais do que a média nos últimos anos.",
      "A série começa em 1996. Para anos anteriores, em escudos, seria preciso o INE.",
    ],
  },

  juros: {
    crumb: "Juros compostos",
    eyebrow: "Calculadora",
    title: "O que faz o tempo ao dinheiro.",
    lede: "Juros sobre juros: cada ano rende sobre o que já rendeu. Parece pouco nos primeiros anos e explode nos últimos. Mete os teus números e vê a curva.",
    formAria: "Poupança e taxa",
    fields: {
      principal: "Valor inicial",
      monthly: "Reforço mensal",
      rate: "Taxa anual",
      rateHint: "Rendimento nominal, antes de impostos. Um depósito a prazo ronda 2–3%; um índice de ações rendeu historicamente 6–8% ao ano, com anos negativos pelo meio.",
      years: "Durante",
      yearsUnit: "anos",
      presets: "Horizontes",
    },
    headline: {
      eyebrow: "Ao fim de {years} anos",
      contributed: "Do teu bolso",
      interest: "Juros ganhos",
      multiple: "Multiplicador",
      multipleValue: "{x}× o que puseste",
    },
    chartTitle: "Como cresce",
    chartAria: "Evolução ao longo de {years} anos: o valor total chega a {final}, do qual {contributed} foi contribuído e {interest} são juros.",
    seriesValue: "Valor total",
    seriesContributed: "O que puseste",
    ledger: {
      caption: "A conta",
      principal: "Valor inicial",
      monthly: "Reforços ({n} meses)",
      contributed: "Total do teu bolso",
      interest: "Juros compostos",
      final: "Valor final",
    },
    insight: {
      title: "O que a curva ensina",
      text: "Repara onde a linha sólida se afasta da tracejada: é aí que os juros passam a render mais do que os reforços. Começar dez anos mais cedo vale mais do que duplicar a taxa.",
    },
    notes: [
      "Taxa nominal, constante, sem impostos: em Portugal os rendimentos de capitais pagam em regra 28% de IRS, o que reduz o resultado.",
      "Não considera inflação. Para ver o poder de compra real, subtrai à taxa a inflação média — cerca de 2% ao ano nas últimas décadas.",
      "Nenhum investimento rende uma taxa fixa todos os anos. Isto é aritmética, não uma previsão.",
    ],
  },

  impostos: {
    crumb: "Recibo do contribuinte",
    eyebrow: "Calculadora",
    title: "Para onde vão os teus impostos?",
    lede: "Todos os meses entregas ao Estado IRS e Segurança Social. O Estado gasta em pensões, saúde, escolas, estradas. Aqui distribuímos o teu dinheiro pelas mesmas proporções — o teu recibo, linha a linha.",
    formAria: "O teu salário",
    fields: {
      bruto: "Salário bruto mensal",
      brutoHint: "Solteiro, sem dependentes, Continente. O IRS e a Segurança Social são calculados com as tabelas de 2026.",
    },
    headline: {
      eyebrow: "Entregas ao Estado, por mês",
      irs: "IRS",
      tsu: "Segurança Social",
      year: "Despesa pública de",
    },
    chartTitle: "Os teus {amount} mensais, distribuídos como o Estado gasta",
    chartAria: "Distribuição de {amount} pelas funções do Estado, na proporção da despesa pública de {year}. A maior fatia é {top}, com {topAmount}.",
    perMonth: "/mês",
    cofog: {
      GF01: "Serviços gerais (Estado, dívida)",
      GF02: "Defesa",
      GF03: "Segurança e justiça",
      GF04: "Economia e transportes",
      GF05: "Ambiente",
      GF06: "Habitação e serviços coletivos",
      GF07: "Saúde",
      GF08: "Cultura, desporto, religião",
      GF09: "Educação",
      GF10: "Proteção social (pensões, apoios)",
    },
    notes: [
      "Aproximação honesta, não contabilidade real: o Estado não guarda o teu IRS numa gaveta com o teu nome. Distribuímos o que entregas na proporção em que o Estado gasta no total.",
      "A despesa inclui tudo o que o Estado gasta — financiado por IRS, IVA, IRC, contribuições e dívida. A Segurança Social que descontas vai sobretudo para pensões, mas aqui entra na mesma proporção que o resto.",
      "«Serviços gerais» inclui os juros da dívida pública.",
      "A despesa pública é publicada com cerca de um ano de atraso; o teu IRS é o de 2026.",
    ],
  },

  dias: {
    crumb: "Dias de trabalho",
    eyebrow: "Calculadora",
    title: "Quantos dias trabalhas para pagar isto?",
    lede: "Mete um preço. Vê quantos dias de salário líquido custa em Portugal — e em mais dezanove países, com o mesmo cálculo.",
    formAria: "Preço e unidade",
    fields: {
      price: "Preço",
      priceHint: "O que quiseres: um telemóvel, uma renda, um carro. Em euros.",
      presets: "Exemplos",
      unit: "Comparar em",
      unitPps: "Poder de compra",
      unitEur: "Euros nominais",
      unitHint:
        "Poder de compra corrige os preços de cada país — é a comparação justa. Euros nominais mostram o salário tal como é pago.",
    },
    headline: {
      eyebrow: "Em Portugal, custa",
      days: "dias de trabalho",
      daysOne: "dia de trabalho",
      weeks: "≈ {weeks} semanas",
      months: "≈ {months} meses",
      daily: "Um dia de trabalho líquido",
    },
    chartTitle: "Nos outros países",
    chartAria: "Dias de trabalho necessários para pagar {price} em {n} países. Portugal: {ptDays} dias. Menos dias: {best} com {bestDays}. Mais dias: {worst} com {worstDays}.",
    chartUnit: "dias",
    missingTitle: "Países em falta",
    missingText:
      "Sem dados comparáveis para {list}. A única fonte com uma unidade comum para países fora da Europa — a OCDE — tem o serviço instável de momento. Entram assim que responder.",
    notes: [
      "Salário líquido anual de uma pessoa solteira sem filhos, a 100% do salário médio do país (Eurostat). Dividido por 220 dias úteis — 52 semanas de 5 dias, menos férias e feriados.",
      "«Poder de compra» usa o PPS (padrão de poder de compra): o mesmo cabaz custa o mesmo em qualquer país. É a comparação justa; o valor nominal em euros é o que se vê no recibo.",
      "O ano varia por país e está indicado ao lado de cada barra.",
    ],
    countries: {
      PT: "Portugal", ES: "Espanha", FR: "França", DE: "Alemanha", IT: "Itália",
      NL: "Países Baixos", BE: "Bélgica", AT: "Áustria", IE: "Irlanda", PL: "Polónia",
      CZ: "Chéquia", SK: "Eslováquia", SE: "Suécia", DK: "Dinamarca", FI: "Finlândia",
      EL: "Grécia", HU: "Hungria", LU: "Luxemburgo", UK: "Reino Unido", CH: "Suíça",
      NO: "Noruega", US: "Estados Unidos", CA: "Canadá", BR: "Brasil", AU: "Austrália",
    },
  },
};

export type EconomiaDict = typeof economiaPt;
