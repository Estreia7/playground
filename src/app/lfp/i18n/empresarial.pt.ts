/* Empresarial branch — Portuguese, canonical. See chrome.pt.ts for why
   there is no `as const`. */

import type { Block } from "./explainers.pt";

/** Typed identity. Inside an otherwise inferred object, a literal block would
 *  widen its discriminant to `string`; passing it through this keeps the
 *  Block union the renderer narrows on. */
const blocks = (b: Block[]) => b;

export const empresarialPt = {
  hub: {
    crumb: "Empresarial",
    eyebrow: "Para empresas",
    title: "Quanto custa mesmo um trabalhador, e para onde vai o resto.",
    lede: "Um salário bruto é só o meio da história. Por cima dele a empresa paga Segurança Social e seguro; por baixo, o trabalhador desconta IRS e a sua parte. E depois há o IVA e o IRC. Aqui fazem-se todas essas contas.",
    topicsAria: "Temas",
    kindCalculadora: "Calculadora",
    topics: {
      custoTrabalhador: {
        title: "Custo real de um trabalhador",
        body: "O que a empresa paga contra o que o trabalhador recebe — e o tamanho da fatia no meio.",
      },
      iva: {
        title: "IVA",
        body: "Com e sem IVA, nas duas direções, em qualquer região. E o erro que quase toda a gente faz.",
      },
      irc: {
        title: "IRC",
        body: "Do lucro tributável ao imposto: taxa geral, taxa reduzida para PME, derramas.",
      },
    },
  },
  regioes: {
    continente: "Continente",
    madeira: "Madeira",
    acores: "Açores",
  },
  custo: {
    crumb: "Custo de um trabalhador",
    eyebrow: "Calculadora",
    title: "Quanto custa um trabalhador de {amount}?",
    lede: "O bruto não é o que a empresa paga nem o que o trabalhador recebe. Põe o salário e vê os dois números — e a fatia entre eles.",
    formAria: "Dados do trabalhador",
    fields: {
      bruto: "Salário bruto mensal",
      seguro: "Seguro de acidentes de trabalho",
      seguroHint: "Estimativa — o prémio é de mercado, não uma taxa legal. Tipicamente {min} a {max} do bruto.",
      outros: "Outros custos mensais",
      outrosHint: "Formação, seguro de saúde, equipamento — o que a empresa pagar a mais.",
    },
    headline: {
      eyebrow: "Custo total para a empresa, por mês",
      recebe: "O trabalhador recebe",
      fatia: "A fatia no meio",
      multiplicador: "Por cada 1 € recebido",
      multiplicadorValue: "a empresa paga {amount}",
      anual: "Custo anual",
    },
    flowTitle: "Para onde vai o dinheiro da empresa",
    flowAria:
      "De {total} de custo total: {liquido} chegam ao trabalhador, {estado} vão para o Estado em IRS e Segurança Social, {empresa} vão para seguros e outros custos.",
    flowLabels: {
      trabalhador: "O trabalhador",
      estado: "O Estado",
      liquido: "Chega ao trabalhador",
      irs: "IRS (retido ao trabalhador)",
      tsu_trab: "Segurança Social (trabalhador)",
      tsu_patronal: "Segurança Social (empresa)",
      seguro_at: "Seguro de acidentes",
      outros: "Outros custos",
    },
    ledger: {
      caption: "A conta, do lado da empresa",
      bruto: "Salário bruto",
      tsuPatronal: "Segurança Social — parte da empresa ({rate})",
      seguro: "Seguro de acidentes (estimativa)",
      subsidio: "Subsídio de refeição",
      outros: "Outros custos",
      total: "Custo total mensal",
      liquido: "Do qual chega ao trabalhador",
      fatia: "Fatia entre os dois",
    },
    notes: [
      "O seguro de acidentes de trabalho é obrigatório, mas o valor é um prémio de mercado. Usamos uma estimativa — ajusta-a ao teu caso.",
      "Só Continente, regime geral dos trabalhadores por conta de outrem.",
      "Não considera formação obrigatória, fundos de compensação nem outros encargos específicos do setor.",
    ],
  },
  iva: {
    crumb: "IVA",
    eyebrow: "Calculadora",
    title: "Com IVA ou sem IVA?",
    lede: "Escreve o preço em qualquer das caixas e a outra preenche-se. Escolhe a taxa e a região — e repara no erro que quase toda a gente faz ao tirar o IVA.",
    formAria: "Preço e taxa",
    fields: {
      semIva: "Preço sem IVA",
      comIva: "Preço com IVA",
      tipo: "Taxa",
      normal: "Normal",
      intermedia: "Intermédia",
      reduzida: "Reduzida",
      regiao: "Região",
    },
    headline: {
      eyebrow: "IVA nesta compra",
      peso: "De cada 100 € que pagas",
      pesoValue: "{amount} são IVA",
      taxa: "Taxa aplicada",
    },
    flowTitle: "Para onde vai o que pagas",
    flowAria: "De {total}: {preco} ficam com quem vende, {iva} vão para o Estado em IVA.",
    flowLabels: {
      vendedor: "Quem vende",
      estado: "O Estado",
      preco: "Preço do bem",
      iva: "IVA",
    },
    mistake: {
      title: "O erro clássico",
      body: "Para tirar o IVA de um preço, divide-se por {divisor} — não se multiplica por {wrongFactor}.",
      wrong: "{gross} × {wrongFactor} = {wrongResult}",
      wrongLabel: "errado",
      right: "{gross} ÷ {divisor} = {rightResult}",
      rightLabel: "certo",
      why: "Multiplicar por {wrongFactor} tira {rate} do preço final, mas o IVA foi calculado sobre o preço inicial, que é mais baixo. A diferença parece pequena numa compra e é grande numa fatura.",
    },
    howItWorks: {
      heading: "Como funciona o IVA",
      blocks: blocks([
        {
          t: "p",
          text: "O IVA é um imposto sobre o consumo. Não o pagas ao Estado — pagas a quem te vende, e é o vendedor que o entrega. Por isso anda escondido dentro do preço.",
        },
        {
          t: "p",
          text: "Cada empresa na cadeia cobra IVA nas vendas e deduz o IVA que pagou nas compras. Só entrega a diferença: o imposto incide sobre o valor que cada uma acrescentou. É daí que vem o nome — Imposto sobre o Valor Acrescentado.",
        },
        {
          t: "p",
          text: "Para ti, consumidor final, não há dedução: ficas com a conta toda. Num preço de 123 € à taxa normal, 23 € nunca chegam ao vendedor.",
        },
        {
          t: "callout",
          title: "Nos orçamentos, atenção ao «+ IVA»",
          text: "Os preços ao público têm o IVA incluído por lei. Um orçamento que diz «+ IVA» está a mostrar-te o preço sem imposto — o que pagas é mais.",
        },
      ]),
    },
    ratesTitle: "As três taxas em {regiao}",
    examples: {
      pao: "Pão",
      leite: "Leite",
      medicamentos: "Medicamentos",
      livros: "Livros",
      restauracao: "Restauração",
      vinho: "Vinho",
      conservas: "Conservas",
      eletrodomesticos: "Eletrodomésticos",
      vestuario: "Vestuário",
      combustivel: "Combustível",
    },
    notes: [
      "A taxa que se aplica a cada bem ou serviço está nas listas anexas ao Código do IVA. Os exemplos são ilustrativos.",
      "As regiões autónomas têm taxas próprias. A da Madeira mudou em outubro de 2024 — muitos sites ainda mostram o valor antigo.",
    ],
  },
  irc: {
    crumb: "IRC",
    eyebrow: "Calculadora",
    title: "Quanto IRC paga uma empresa?",
    lede: "Do lucro tributável ao imposto a pagar: a taxa geral, a taxa reduzida para PME nos primeiros 50 mil euros, e as derramas por cima.",
    formAria: "Dados da empresa",
    fields: {
      lucro: "Lucro tributável anual",
      lucroHint: "O resultado fiscal, depois dos ajustamentos — não o lucro contabilístico.",
      pme: "É PME ou Small Mid Cap",
      pmeHint: "Taxa reduzida sobre a primeira parcela do lucro.",
      derramaMunicipal: "Derrama municipal",
      derramaMunicipalHint: "Fixada por cada município, até ao máximo legal de {max}. Lisboa e Porto aplicam o máximo.",
      derramaEstadual: "Aplicar derrama estadual",
      derramaEstadualHint: "Só incide sobre lucros acima de {threshold}.",
    },
    headline: {
      eyebrow: "Imposto estimado",
      efetiva: "Taxa efetiva",
      liquido: "Lucro depois do imposto",
      geral: "Taxa geral",
    },
    howItWorks: {
      heading: "Como funciona o IRC",
      blocks: blocks([
        {
          t: "p",
          text: "O IRC é o imposto sobre o lucro das empresas — não sobre o que faturam, mas sobre o que sobra depois dos custos. Uma empresa com muita faturação e pouco lucro paga pouco IRC.",
        },
        {
          t: "p",
          text: "Parte-se do lucro contabilístico, fazem-se ajustamentos fiscais — há despesas que a lei não aceita, e outras que aceita a mais — e chega-se ao lucro tributável. É sobre esse que as taxas se aplicam.",
        },
        {
          t: "p",
          text: "Por cima do IRC há a derrama municipal, que cada câmara decide até 1,5%, e a derrama estadual para lucros acima de 1,5 milhões. Ambas incidem sobre o lucro tributável, não sobre o imposto.",
        },
        {
          t: "callout",
          title: "Ser PME conta",
          text: "Os primeiros 50.000 € de lucro pagam uma taxa mais baixa. Em 2026 a diferença são 2.000 € por ano — a mesma empresa, o mesmo lucro, menos imposto.",
        },
      ]),
    },
    flowTitle: "Para onde vai o lucro",
    flowAria: "De {lucro} de lucro tributável: {liquido} ficam na empresa, {irc} vão para o Estado em IRC e {derrama} em derramas.",
    flowLabels: {
      empresa: "A empresa",
      estado: "O Estado",
      lucro: "Fica na empresa",
      irc: "IRC",
      derrama: "Derramas",
    },
    ledger: {
      caption: "A conta, linha a linha",
      lucro: "Lucro tributável",
      trancheReduzida: "IRC à taxa reduzida ({rate} sobre {base})",
      geral: "IRC à taxa geral ({rate} sobre {base})",
      derramaMunicipal: "Derrama municipal ({rate})",
      derramaEstadual: "Derrama estadual",
      total: "Total de imposto",
      liquido: "Lucro depois do imposto",
    },
    notes: [
      "Estimativa sobre o lucro tributável. Não considera tributações autónomas, pagamentos por conta, deduções à coleta nem prejuízos de anos anteriores — não é uma Modelo 22.",
      "A taxa geral de 2026 é 19% por norma transitória; o Código do IRC já diz 17%, que só vigora em 2028.",
      "Derrama estadual apresentada para o Continente. As regiões autónomas têm taxas reduzidas.",
    ],
  },
};

export type EmpresarialDict = typeof empresarialPt;
