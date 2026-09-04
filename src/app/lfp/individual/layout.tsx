import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Individual",
    template: "%s · Individual · LFP",
  },
  description:
    "O que sai do teu salário e para onde vai: IRS, Segurança Social, salário líquido e recibos verdes, explicados com calculadoras.",
};

export default function IndividualLayout({ children }: { children: React.ReactNode }) {
  return children;
}
