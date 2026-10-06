import type { Metadata } from "next";
import FlowView from "./FlowView.tsx";

export const metadata: Metadata = {
  title: "XRP Smart Flow Index",
  description:
    "XRP exchange inflows and outflows from the XRP Ledger, split into whale-sized and smaller payments, against the XRP price.",
};

export default function FlowPage() {
  return <FlowView />;
}
