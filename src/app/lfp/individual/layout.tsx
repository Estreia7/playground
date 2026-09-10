import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Individual",
    // Two segments, not three: the branch name runs past what a shared
    // link shows and adds nothing the reader needs there.
    template: "%s · LFP",
  },
  description:
    "O que sai do teu salário e para onde vai: IRS, Segurança Social e o líquido que fica mesmo contigo.",
};

export default function IndividualLayout({ children }: { children: React.ReactNode }) {
  return children;
}
