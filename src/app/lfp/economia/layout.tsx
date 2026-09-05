import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Economia",
    template: "%s · Economia · LFP",
  },
  description:
    "Inflação, poder de compra, para onde vão os impostos e como Portugal se compara com outros países — com dados oficiais do Eurostat e o ano à vista.",
};

export default function EconomiaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
