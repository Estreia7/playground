import type { Metadata } from "next";
import { StatsView } from "./StatsView";

export const metadata: Metadata = { title: "Estatísticas" };

export default function StatsPage() {
  return <StatsView />;
}
