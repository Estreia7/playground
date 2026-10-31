import type { Metadata } from "next";
import localFont from "next/font/local";
import { CryptoNav } from "./ui/Nav.tsx";
import "./theme.css";

/* Type: Chakra Petch for the few display moments (page titles, gauge
   readings, card values) — squared, a little mechanical, the lettering of
   an exchange board rather than a fintech brochure. Geist for reading and
   Geist Mono for every price, so digits line up in columns as they tick. */

const display = localFont({
  src: [
    { path: "../../fonts/chakra-petch-500.woff2", weight: "500" },
    { path: "../../fonts/chakra-petch-600.woff2", weight: "600" },
    { path: "../../fonts/chakra-petch-700.woff2", weight: "700" },
  ],
  variable: "--font-cx-display",
});

const body = localFont({ src: "../../fonts/geist.woff2", variable: "--font-cx-body", weight: "100 900" });

const mono = localFont({
  src: "../../fonts/geist-mono.woff2",
  variable: "--font-cx-mono",
  weight: "100 900",
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
