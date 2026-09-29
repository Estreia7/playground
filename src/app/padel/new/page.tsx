import type { Metadata } from "next";
import { NewTournament } from "./NewTournament";

export const metadata: Metadata = { title: "Novo torneio" };

export default function NewTournamentPage() {
  return <NewTournament />;
}
