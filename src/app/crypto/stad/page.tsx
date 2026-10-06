import type { Metadata } from "next";
import StadView from "./StadView.tsx";

export const metadata: Metadata = {
  title: "BTC Short-Term Accumulation & Distribution",
  description:
    "Bitcoin price against short-term holder SOPR: when recent buyers capitulate (accumulate) and when they take profit (distribution).",
};

export default function StadPage() {
  return <StadView />;
}
