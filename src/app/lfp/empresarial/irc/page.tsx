import type { Metadata } from "next";
import IrcTool from "./IrcTool";

export const metadata: Metadata = {
  title: "IRC",
  description:
    "Quanto paga de IRC uma empresa em Portugal? Taxa reduzida para PME, derrama municipal e estadual, com 2026.",
};

export default function IrcPage() {
  return <IrcTool />;
}
