import type { Metadata } from "next";
import OverviewView from "./OverviewView.tsx";

export const metadata: Metadata = {
  title: "Crypto Desk — market overview",
  description: "The top 100 coins with daily and weekly RSI signals, the Bull Market Support Band and market-wide greed levels.",
};

export default function CryptoPage() {
  return <OverviewView />;
}
