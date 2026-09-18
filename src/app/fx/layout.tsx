import type { Metadata } from "next";
import { Schibsted_Grotesk, Geist, Geist_Mono } from "next/font/google";
import "./theme.css";

/* Type: three faces, three jobs.

   Schibsted Grotesk carries the display work — scores and section titles. It
   has the slightly compressed, newspaper-finance feel this subject wants
   without tipping into pastiche.

   Geist is the body face, and Geist Mono handles every number on screen.
   Prices, pips, times and P&L all need tabular figures: a column of numbers
   whose digits shift width as they tick is unreadable at a glance, which is
   the only way anyone reads a trading screen. */

const display = Schibsted_Grotesk({
  variable: "--font-fx-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Geist({
  variable: "--font-fx-body",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-fx-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "FX Lab — EUR/USD pattern finder",
    template: "%s · FX Lab",
  },
  description:
    "Find EUR/USD setups by asking what the market did last time it looked like this, with RSI, MACD and candlestick evidence behind every score.",
};

export default function FxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`fx ${display.variable} ${body.variable} ${mono.variable}`}>{children}</div>
  );
}
