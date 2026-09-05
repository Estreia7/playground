import type { Metadata } from "next";
import InflacaoView from "./InflacaoView";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const TITLE = "Máquina do tempo da inflação";
const DESCRIPTION =
  "Quanto vale hoje o dinheiro de 1999, 2010 ou 2020? Inflação em Portugal com o índice de preços do Eurostat desde 1996.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const amount = Math.round(num(sp.amount, 1000, 0, 100000000));
  const from = Math.round(num(sp.from, 1999, 1996, 2100));
  const to = Math.round(num(sp.to, 2025, 1996, 2100));
  const image = `/api/lfp/og/inflacao?amount=${amount}&from=${from}&to=${to}&lang=pt`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: `${TITLE} · LFP`, description: DESCRIPTION, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function InflacaoPage() {
  return <InflacaoView />;
}
