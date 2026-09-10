import type { Metadata } from "next";
import CenariosView from "./CenariosView";

export const metadata: Metadata = {
  title: "Comparar cenários",
  description:
    "1.400 € × 14 ou 1.600 € × 12? Põe as duas propostas lado a lado e vê qual rende mais ao fim do ano.",
};

export default function CenariosPage() {
  return <CenariosView />;
}
