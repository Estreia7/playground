import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Economia",
    // Two segments, not three: "Página · Economia · LFP" runs past what a
    // shared link shows, and the branch adds nothing a reader needs there.
    template: "%s · LFP",
  },
  description:
    "Inflação, poder de compra e para onde vão os impostos — com dados oficiais do Eurostat e o ano à vista.",
};

export default function EconomiaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
