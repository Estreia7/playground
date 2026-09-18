import type { Metadata } from "next";
import FxView from "./FxView.tsx";

export const metadata: Metadata = {
  title: "FX Lab — EUR/USD pattern finder",
  description:
    "Find EUR/USD setups by asking what the market did last time it looked like this, with RSI, MACD and candlestick evidence behind every score.",
};

export default function FxPage() {
  return <FxView />;
}
