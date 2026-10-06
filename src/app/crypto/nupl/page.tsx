import type { Metadata } from "next";
import { Suspense } from "react";
import NuplView from "./NuplView.tsx";

export const metadata: Metadata = {
  title: "Net Unrealized Profit/Loss",
  description: "Price alongside an estimated Net Unrealized Profit/Loss: is the market holding profit or loss, and how much?",
};

export default function NuplPage() {
  return (
    <Suspense fallback={null}>
      <NuplView />
    </Suspense>
  );
}
