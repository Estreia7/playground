import type { Metadata } from "next";
import HomeView from "./HomeView";

export const metadata: Metadata = {
  title: "LFP — Literacia Financeira Portuguesa",
  // Kept inside ~120 characters: WhatsApp cuts the rest mid-word, and this
  // is the link people actually paste into a group chat.
  description:
    "IRS, IVA, Segurança Social e inflação explicados em português simples — com calculadoras e fontes públicas.",
};

export default function LfpPage() {
  return <HomeView />;
}
