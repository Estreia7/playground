import type { Metadata } from "next";
import IrcTool from "./IrcTool";

export const metadata: Metadata = {
  title: "IRC",
  description:
    "Estima o IRC de uma empresa em 2026: taxa geral, taxa reduzida para PME nos primeiros 50.000 €, derrama municipal e derrama estadual.",
};

export default function IrcPage() {
  return <IrcTool />;
}
