import type { Metadata } from "next";
import { RacketsView } from "./RacketsView";

export const metadata: Metadata = { title: "Raquetes" };

export default function RacketsPage() {
  return <RacketsView />;
}
