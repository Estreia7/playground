/* Long-form explainers — Portuguese, canonical.

   Unlike the other fragments, the type here is written by hand: the content
   uses discriminated blocks ({ t: "p" }, { t: "steps" }...), and `typeof` on
   a plain literal would widen `t` to string and lose the union the renderer
   narrows on. Both languages are checked against the same interface, so the
   guarantee is the same — a missing key fails to compile — it just comes
   from an explicit type instead of an inferred one. */

export type Block =
  | { t: "p"; text: string }
  | { t: "callout"; title?: string; text: string }
  | { t: "list"; items: string[] }
  | { t: "steps"; items: { title: string; text: string }[] };

/** A widget slot: an interactive component the layout renders at the end of
 *  a section. Which ones exist is decided by the page, not the dictionary. */
export type Widget = "brackets" | "tsuSplit";

export interface Section {
  id: string;
  heading: string;
  blocks: Block[];
  widget?: Widget;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Explainer {
  crumb: string;
  eyebrow: string;
  title: string;
  lede: string;
  tldrTitle: string;
  tldr: string[];
  sections: Section[];
  faqTitle: string;
  faq: Faq[];
  next: { label: string; title: string; href: string };
}

export interface ExplainersDict {
  common: {
    sourcesTitle: string;
    bracketsTitle: string;
    bracketsSalary: string;
    bracketsUpTo: string;
    bracketsAbove: string;
    bracketsMarginal: string;
    bracketsParcela: string;
    bracketsFormula: string;
    bracketsYours: string;
    bracketsMarginalIs: string;
    bracketsEffectiveIs: string;
    bracketsProof: string;
    annualTitle: string;
    annualFrom: string;
    annualTo: string;
    annualRate: string;
    tsuSplitTitle: string;
    tsuSplitWorker: string;
    tsuSplitEmployer: string;
    tsuSplitTotal: string;
    tsuSplitOn: string;
  };
  irs: Explainer;
  tsu: Explainer;
}

export const explainersPt: ExplainersDict = {
  common: {
    sourcesTitle: "Fontes",
    bracketsTitle: "As tabelas de retenção, com o teu salário",
    bracketsSalary: "Salário bruto mensal",
    bracketsUpTo: "Até",
    bracketsAbove: "Acima de",
    bracketsMarginal: "Taxa marginal",
    bracketsParcela: "Parcela a abater",
    bracketsFormula: "fórmula",
    bracketsYours: "o teu escalão",
    bracketsMarginalIs: "Taxa marginal: {rate} — só sobre o que ganhas acima do escalão anterior.",
    bracketsEffectiveIs: "Taxa efetiva: {rate} — o que pagas mesmo, em média, sobre o total.",
    bracketsProof: "Experimenta pôr {below} e depois {above}. O líquido sobe. Subir de escalão nunca te faz ganhar menos.",
    annualTitle: "Os escalões anuais",
    annualFrom: "De",
    annualTo: "a",
    annualRate: "Taxa",
    tsuSplitTitle: "Quem paga o quê, sobre {amount} de bruto",
    tsuSplitWorker: "Tu, descontado do salário",
    tsuSplitEmployer: "A empresa, por cima do salário",
    tsuSplitTotal: "Total para a Segurança Social",
    tsuSplitOn: "sobre um bruto de",
  },

  irs: {
    crumb: "IRS",
    eyebrow: "Explicação",
    title: "IRS: o imposto sobre o que ganhas.",
    lede: "É a fatia maior do que sai do teu salário, e a mais mal compreendida. Aqui fica o essencial, sem jargão, e uma tabela onde podes ver o teu caso.",
    tldrTitle: "Em 30 segundos",
    tldr: [
      "O IRS é o imposto sobre o rendimento que ganhas num ano: salário, pensões, rendas, trabalho independente.",
      "É progressivo por escalões: quanto mais ganhas, maior a taxa — mas cada taxa só se aplica à fatia que cai nesse escalão.",
      "O que sai do recibo todos os meses é uma retenção na fonte: um adiantamento, não o imposto final.",
      "O acerto faz-se na declaração anual. Se retiveste a mais, recebes de volta; se a menos, pagas a diferença.",
      "Subir de escalão nunca te faz ganhar menos. Nunca.",
    ],
    sections: [
      {
        id: "o-que-e",
        heading: "O que é, ao certo",
        blocks: [
          {
            t: "p",
            text: "IRS quer dizer Imposto sobre o Rendimento das Pessoas Singulares. É o imposto que o Estado cobra sobre o dinheiro que uma pessoa ganha ao longo de um ano — o salário, mas também pensões, rendas de uma casa que alugues, ou o que faturas se trabalhas por conta própria.",
          },
          {
            t: "p",
            text: "Nesta página falamos do caso mais comum: o salário de quem trabalha por conta de outrem. É o que a lei chama rendimento da categoria A, e é o que a calculadora de salário líquido simula.",
          },
          {
            t: "callout",
            title: "Uma ideia que muda tudo",
            text: "O IRS não incide sobre o que ganhas num mês — incide sobre o que ganhas num ano. Tudo o que acontece mês a mês é uma aproximação a esse número anual.",
          },
        ],
      },
      {
        id: "progressivo",
        heading: "Porque é progressivo, e o que isso quer dizer",
        blocks: [
          {
            t: "p",
            text: "O rendimento é dividido em escalões, e cada escalão tem a sua taxa. A primeira fatia paga a taxa mais baixa, a fatia seguinte paga a taxa seguinte, e por aí fora. A taxa mais alta que te toca só se aplica à parte do rendimento que ultrapassa o último limite.",
          },
          {
            t: "p",
            text: "Por isso existem duas taxas diferentes para a mesma pessoa. A taxa marginal é a do último escalão em que entras — a que pagas sobre o próximo euro. A taxa efetiva é a média do que pagas sobre o total, e é sempre mais baixa que a marginal.",
          },
          {
            t: "callout",
            title: "O mito",
            text: "«Se subir de escalão, fico a ganhar menos.» É falso, e custa dinheiro a quem acredita — há quem recuse aumentos por causa disto. A taxa nova só toca no que ganhas acima do limite. Experimenta na tabela abaixo: mete um valor logo abaixo de um limite, depois logo acima. O líquido sobe sempre.",
          },
        ],
        widget: "brackets",
      },
      {
        id: "retencao",
        heading: "A retenção na fonte: o adiantamento mensal",
        blocks: [
          {
            t: "p",
            text: "O Estado não espera pelo fim do ano para receber. Todos os meses a entidade patronal retém uma parte do salário e entrega-a às Finanças por ti. A esse valor chama-se retenção na fonte, e é calculado com tabelas publicadas todos os anos.",
          },
          {
            t: "steps",
            items: [
              {
                title: "Encontra-se o escalão",
                text: "O salário bruto do mês é procurado na tabela certa — há tabelas diferentes para não casados, casados com um ou dois titulares, e para quem tem dependentes.",
              },
              {
                title: "Aplica-se a taxa marginal",
                text: "Multiplica-se o bruto pela taxa marginal desse escalão. Isto daria um valor demasiado alto, porque taxa toda a base à taxa mais alta.",
              },
              {
                title: "Abate-se a parcela",
                text: "Por isso subtrai-se a parcela a abater, um valor fixo por escalão que corrige exatamente esse excesso. É assim que a progressividade se faz numa só linha de cálculo.",
              },
              {
                title: "Descontam-se os dependentes",
                text: "Por cada dependente, subtrai-se ainda mais um valor à retenção. O resultado nunca fica abaixo de zero.",
              },
            ],
          },
          {
            t: "p",
            text: "Nos primeiros escalões acima do salário mínimo, a parcela a abater não é um número fixo — é uma fórmula que depende do próprio salário. Serve para o imposto entrar devagar, em vez de aparecer de repente ao primeiro euro acima do mínimo.",
          },
          {
            t: "list",
            items: [
              "Os subsídios de férias e de Natal são retidos à parte, cada um com a sua taxa. Não se somam ao mês, e não te empurram para um escalão mais alto.",
              "O subsídio de refeição não paga IRS até um limite diário. Só o que ultrapassar esse limite entra na conta.",
              "A retenção é um adiantamento. Uma retenção mais baixa não é «pagar menos imposto» — é pagar mais tarde.",
            ],
          },
        ],
      },
      {
        id: "acerto",
        heading: "O acerto anual: onde tudo se resolve",
        blocks: [
          {
            t: "p",
            text: "Entre abril e junho entregas a declaração de IRS com o que ganhaste no ano anterior. Aí calcula-se o imposto a sério, com os escalões anuais e todas as deduções, e compara-se com o que já foi retido mês a mês.",
          },
          {
            t: "p",
            text: "Antes de aplicar as taxas, o Estado retira ao teu rendimento uma dedução específica — um valor fixo anual que reconhece que trabalhar tem custos. Depois, ao imposto calculado, subtrai deduções à coleta: uma parte do que gastaste em saúde, educação, habitação, e das faturas que pediste com o teu número de contribuinte.",
          },
          {
            t: "callout",
            title: "Reembolso não é prémio",
            text: "Receber reembolso em maio significa que ao longo do ano retiveste mais do que devias. Foi o teu dinheiro, emprestado ao Estado sem juros. Não é bom nem mau — é só o acerto.",
          },
          {
            t: "p",
            text: "Há ainda um mínimo de existência: um rendimento anual abaixo do qual não se paga IRS, para garantir que ninguém fica abaixo de um certo nível por causa do imposto. Em 2026 coincide com o salário mínimo a 14 meses.",
          },
        ],
      },
      {
        id: "nao-cobre",
        heading: "O que este site não cobre (ainda)",
        blocks: [
          {
            t: "list",
            items: [
              "IRS Jovem — a redução para quem começa a trabalhar. Muda as contas de forma significativa nos primeiros anos.",
              "Residentes não habituais e regimes especiais.",
              "Outras categorias de rendimento: rendas, mais-valias, trabalho independente. A calculadora de recibos verdes vai tratar deste último.",
              "As tabelas da Madeira e dos Açores, que são diferentes das do Continente.",
            ],
          },
        ],
      },
    ],
    faqTitle: "Perguntas que toda a gente faz",
    faq: [
      {
        q: "Tive um aumento e o líquido subiu menos do que o bruto. Fui roubado?",
        a: "Não. Cada euro a mais do aumento é taxado à tua taxa marginal, que é a mais alta que te toca. Se a marginal é 31%, de um aumento de 100 € ficam cerca de 69 € — mais os 11% de Segurança Social que também saem. O líquido sobe sempre; só sobe menos do que o bruto.",
      },
      {
        q: "Posso pedir para reterem menos e ficar com mais dinheiro por mês?",
        a: "Podes pedir para reterem mais — nunca menos do que a tabela manda. E reter mais só significa um reembolso maior no ano seguinte. O imposto final é o mesmo.",
      },
      {
        q: "Sou casado. Escolho «um titular» ou «dois titulares»?",
        a: "Dois titulares se ambos têm rendimentos; um titular se só um deles tem. A tabela de dois titulares é a mesma dos não casados sem dependentes — só a parcela por dependente muda.",
      },
      {
        q: "Vale a pena declarar os dependentes na empresa?",
        a: "Sim. Cada dependente baixa a retenção mensal, e portanto tens mais dinheiro em mão ao longo do ano em vez de o receberes todo em reembolso.",
      },
    ],
    next: {
      label: "A seguir",
      title: "Segurança Social: os outros 11%",
      href: "/lfp/individual/tsu",
    },
  },

  tsu: {
    crumb: "Segurança Social",
    eyebrow: "Explicação",
    title: "Segurança Social: os 11% que não são só teus.",
    lede: "Do teu salário sai uma fatia todos os meses — e a empresa paga outra, maior, que nunca vês no recibo. É um seguro coletivo. Aqui explica-se o que compra.",
    tldrTitle: "Em 30 segundos",
    tldr: [
      "Descontas 11% do bruto para a Segurança Social. A empresa paga mais 23,75% por cima do teu salário.",
      "Juntos são 34,75% do bruto: a Taxa Social Única.",
      "Não é um imposto — é uma contribuição. Compra proteção: reforma, doença, desemprego, parentalidade.",
      "Cada mês de descontos conta para a tua carreira contributiva, que determina a tua pensão.",
    ],
    sections: [
      {
        id: "os-11",
        heading: "O que são os 11%",
        blocks: [
          {
            t: "p",
            text: "Na linha «Segurança Social» do teu recibo está 11% do salário bruto. Ao contrário do IRS, não há escalões nem tabelas: é uma taxa única, igual para toda a gente que trabalha por conta de outrem, e sai antes de qualquer outra conta.",
          },
          {
            t: "p",
            text: "Incide sobre o salário e sobre os subsídios de férias e de Natal. Não incide sobre o subsídio de refeição até ao limite diário isento — só sobre o que passar disso.",
          },
        ],
      },
      {
        id: "a-parte-que-nao-ves",
        heading: "A parte que não vês: 23,75%",
        blocks: [
          {
            t: "p",
            text: "Por cada 100 € de salário bruto, a empresa paga mais 23,75 € à Segurança Social. Não aparece no teu recibo porque não sai do teu salário — sai do orçamento da empresa, por cima dele. É a principal razão por que um trabalhador custa muito mais do que o seu bruto.",
          },
          {
            t: "p",
            text: "Somando as duas partes, 34,75% do teu bruto vai todos os meses para a Segurança Social. É mais do que o IRS na maioria dos salários.",
          },
        ],
        widget: "tsuSplit",
      },
      {
        id: "o-que-compra",
        heading: "O que compras com isto",
        blocks: [
          {
            t: "p",
            text: "A Segurança Social é um seguro coletivo: os que trabalham hoje pagam as prestações de quem hoje precisa, e quando precisarem serão os que trabalham nessa altura a pagar as deles. Chama-se sistema de repartição.",
          },
          {
            t: "list",
            items: [
              "Reforma — a pensão de velhice, calculada a partir dos anos e dos valores que descontaste.",
              "Doença — o subsídio quando ficas de baixa, a partir de uns dias.",
              "Desemprego — se perderes o trabalho sem ser por tua vontade, com um mínimo de tempo de descontos.",
              "Parentalidade — a licença de mãe e de pai, paga pela Segurança Social e não pela empresa.",
              "Invalidez e morte — pensões para ti se ficares incapaz de trabalhar, ou para a tua família.",
            ],
          },
          {
            t: "callout",
            title: "Carreira contributiva",
            text: "Cada mês em que descontas fica registado. Esse registo — a tua carreira contributiva — é o que determina se tens direito a cada prestação, e de quanto. Podes consultá-lo a qualquer momento na Segurança Social Direta.",
          },
        ],
      },
      {
        id: "recibos-verdes",
        heading: "E quem trabalha a recibos verdes?",
        blocks: [
          {
            t: "p",
            text: "Quem trabalha por conta própria também desconta, mas com regras diferentes: a taxa é outra, e aplica-se a uma parte do que faturam, não ao total. E não há nenhuma empresa a pagar os 23,75% por cima — essa proteção fica mais fina.",
          },
          {
            t: "p",
            text: "É uma das diferenças reais entre um contrato e recibos verdes com o mesmo valor bruto. A calculadora de recibos verdes, quando estiver pronta, põe os dois lado a lado.",
          },
        ],
      },
    ],
    faqTitle: "Perguntas que toda a gente faz",
    faq: [
      {
        q: "Os 11% saem do subsídio de refeição?",
        a: "Só da parte que ultrapassa o limite diário isento. Até esse valor, o subsídio não desconta para a Segurança Social nem paga IRS.",
      },
      {
        q: "E dos subsídios de férias e de Natal?",
        a: "Sim, integralmente. Contam como remuneração e descontam os mesmos 11%.",
      },
      {
        q: "Posso ver quanto já descontei?",
        a: "Sim, na Segurança Social Direta, o portal online. Mostra a tua carreira contributiva mês a mês e uma simulação da pensão.",
      },
      {
        q: "Porque é que a parte da empresa é maior que a minha?",
        a: "É uma escolha política: fazer recair a maior parte do custo sobre quem emprega, não sobre quem trabalha. Mas, na prática, a empresa conta com os dois valores quando decide quanto te pode pagar.",
      },
    ],
    next: {
      label: "A seguir",
      title: "Calcula o teu salário líquido",
      href: "/lfp/individual/salario-liquido",
    },
  },
};
