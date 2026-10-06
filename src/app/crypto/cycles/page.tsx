import type { Metadata } from "next";
import { Suspense } from "react";
import CyclesView from "./CyclesView.tsx";

export const metadata: Metadata = {
  title: "Market cycles",
  description:
    "Compare a coin's price with the size, duration and turning points of its previous bull and bear markets.",
};

export default function CyclesPage() {
  return (
    <Suspense fallback={null}>
      <CyclesView />
    </Suspense>
  );
}
