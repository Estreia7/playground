/* Adapters from calculator results to flow streams.

   MoneyFlow knows only "amounts moving between two poles" — it has no idea
   what IRS is. Keeping the tax semantics here is what lets one component
   serve every calculator on the site. All pure. */

import type {
  CustoEmpresaResult,
  FlowStream,
  IvaResult,
  IrcResult,
  SalarioLiquidoResult,
} from "../types";

export interface FlowModel {
  origin: { label: string; total: number };
  destination: { label: string; total: number };
  streams: FlowStream[];
  baseline: number;
}

export function fromSalarioLiquido(
  r: SalarioLiquidoResult,
  labels: { carteira: string; estado: string; liquido: string; irs: string; tsu: string }
): FlowModel {
  const streams: FlowStream[] = [
    {
      id: "liquido",
      label: labels.liquido,
      amount: r.liquidoMensal,
      direction: "toPeople",
      tone: "liquido",
    },
    {
      id: "irs",
      label: labels.irs,
      amount: r.irsRetido,
      direction: "toState",
      tone: "irs",
      href: "/lfp/individual/irs",
    },
    {
      id: "tsu",
      label: labels.tsu,
      amount: r.tsuTrabalhador,
      direction: "toState",
      tone: "tsu-trab",
      href: "/lfp/individual/tsu",
    },
  ];

  return {
    origin: { label: labels.carteira, total: r.liquidoMensal },
    destination: { label: labels.estado, total: r.totalEntregueAoEstado },
    streams,
    // Gross plus any meal allowance, so the lanes sum to what the payslip
    // actually starts from.
    baseline: r.brutoMensal + r.subsidioRefeicaoIsento + r.subsidioRefeicaoTributado,
  };
}

export function fromCustoEmpresa(
  r: CustoEmpresaResult,
  labels: Record<string, string>
): FlowModel {
  const streams: FlowStream[] = r.breakdown
    .filter((b) => b.amount > 0)
    .map((b) => ({
      id: b.key,
      label: labels[b.key] ?? b.key,
      amount: b.amount,
      direction: b.side === "estado" ? "toState" : "toPeople",
      tone:
        b.key === "liquido"
          ? "liquido"
          : b.key === "irs"
            ? "irs"
            : b.key === "tsu_trab"
              ? "tsu-trab"
              : b.key === "tsu_patronal"
                ? "tsu-patronal"
                : "empresa",
    }));

  const toState = streams
    .filter((s) => s.direction === "toState")
    .reduce((s, x) => s + x.amount, 0);

  return {
    origin: { label: labels.trabalhador ?? "Trabalhador", total: r.liquidoTrabalhador },
    destination: { label: labels.estado ?? "Estado", total: Math.round(toState * 100) / 100 },
    streams,
    baseline: r.custoTotalMensal,
  };
}

export function fromIva(
  r: IvaResult,
  labels: { vendedor: string; estado: string; preco: string; iva: string }
): FlowModel {
  return {
    origin: { label: labels.vendedor, total: r.semIva },
    destination: { label: labels.estado, total: r.iva },
    streams: [
      { id: "preco", label: labels.preco, amount: r.semIva, direction: "toPeople", tone: "liquido" },
      { id: "iva", label: labels.iva, amount: r.iva, direction: "toState", tone: "iva" },
    ],
    baseline: r.comIva,
  };
}

export function fromIrc(
  r: IrcResult,
  labels: { empresa: string; estado: string; lucro: string; irc: string; derrama: string }
): FlowModel {
  const streams: FlowStream[] = [
    {
      id: "lucro_liquido",
      label: labels.lucro,
      amount: r.lucroLiquido,
      direction: "toPeople",
      tone: "liquido",
    },
    { id: "irc", label: labels.irc, amount: r.coletaIrc, direction: "toState", tone: "irc" },
  ];

  const derrama = r.derramaMunicipal + r.derramaEstadual;
  if (derrama > 0) {
    streams.push({
      id: "derrama",
      label: labels.derrama,
      amount: Math.round(derrama * 100) / 100,
      direction: "toState",
      tone: "tsu-patronal",
    });
  }

  return {
    origin: { label: labels.empresa, total: r.lucroLiquido },
    destination: { label: labels.estado, total: r.totalImposto },
    streams,
    baseline: r.lucroTributavel,
  };
}
