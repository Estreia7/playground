import type { Metadata } from "next";
import { Suspense } from "react";
import ChartView from "./ChartView.tsx";

export const metadata: Metadata = {
  title: "Chart",
  description: "TradingView chart with drawing tools and indicators, and the top 100 coins on the side to switch between.",
};

// The view reads ?s= from the URL, which needs a Suspense boundary to render.
export default function ChartPage() {
  return (
    <Suspense fallback={null}>
      <ChartView />
    </Suspense>
  );
}
