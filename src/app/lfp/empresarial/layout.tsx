import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Empresarial",
    // Two segments, not three: the branch name runs past what a shared
    // link shows and adds nothing the reader needs there.
    template: "%s · LFP",
  },
  description:
    "Quanto custa mesmo um trabalhador, e como funcionam o IVA e o IRC: calculadoras com números que podes verificar.",
};

export default function EmpresarialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
