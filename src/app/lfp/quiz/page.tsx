import type { Metadata } from "next";
import QuizApp from "./QuizApp";

export const metadata: Metadata = {
  title: "Quiz de literacia financeira",
  description:
    "Testa o que sabes sobre IRS, Segurança Social, IVA, IRC e economia: escolha múltipla, resposta imediata, e a fonte de cada resposta. As perguntas que erras voltam.",
};

export default function QuizPage() {
  return <QuizApp />;
}
