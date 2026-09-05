import type { Metadata } from "next";
import QuizApp from "./QuizApp";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const TITLE = "Quiz de literacia financeira";
const DESCRIPTION =
  "Testa o que sabes sobre IRS, Segurança Social, IVA, IRC e economia: escolha múltipla, resposta imediata, e a fonte de cada resposta. As perguntas que erras voltam.";
const MODES = ["geral", "irs", "tsu", "iva", "irc", "economia"];

/** A shared result link carries mode, correct and total; the page itself
 *  ignores them (progress lives in the reader's own browser) but the card
 *  the link unfurls shows the sender's rank. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const mode = MODES.includes(String(sp.mode)) ? String(sp.mode) : null;
  const t = Number(sp.t);
  const c = Number(sp.c);
  const valid = mode !== null && Number.isInteger(t) && t > 0 && t <= 100 && Number.isInteger(c) && c >= 0 && c <= t;
  const image = valid ? `/api/lfp/og/quiz?mode=${mode}&c=${c}&t=${t}&lang=pt` : `/api/lfp/og/quiz?mode=geral&c=0&t=1&lang=pt`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: `${TITLE} · LFP`, description: DESCRIPTION, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function QuizPage() {
  return <QuizApp />;
}
