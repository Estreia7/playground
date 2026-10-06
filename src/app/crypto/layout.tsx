import type { Metadata } from "next";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import { CryptoNav } from "./ui/Nav.tsx";
import "./theme.css";

/* Type: Chakra Petch for the few display moments (page titles, gauge
   readings, card values) — squared, a little mechanical, the lettering of
   an exchange board rather than a fintech brochure. Geist for reading and
   Geist Mono for every price, so digits line up in columns as they tick. */

const display = Chakra_Petch({
  variable: "--font-cx-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Geist({ variable: "--font-cx-body", subsets: ["latin"] });

const mono = Geist_Mono({
  variable: "--font-cx-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Crypto Desk", template: "%s · Crypto Desk" },
  description:
    "Crypto market overview with RSI and Bull Market Support signals, TradingView charts, bull and bear cycle analysis, STH-SOPR, XRP exchange flows and NUPL.",
};

export default function CryptoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`cx ${display.variable} ${body.variable} ${mono.variable}`}>
      <CryptoNav />
      {children}
    </div>
  );
}
