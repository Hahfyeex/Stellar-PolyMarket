import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MarketPageClient from "./MarketPageClient";

interface Market {
  id: number;
  question: string;
  total_pool: string;
  outcomes: string[];
}

async function fetchMarket(id: string): Promise<Market | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const market = await fetchMarket(params.id);
  if (!market) {
    return { title: "Market Not Found | Stella Polymarket" };
  }

  const description = `Pool: ${parseFloat(market.total_pool).toFixed(2)} XLM · Outcomes: ${market.outcomes.join(", ")}`;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/market/${params.id}`;

  return {
    title: `${market.question} | Stella Polymarket`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: market.question,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: market.question,
      description,
    },
  };
}

export default async function MarketPage({ params }: { params: { id: string } }) {
  const market = await fetchMarket(params.id);
  if (!market) notFound();

  return <MarketPageClient marketId={params.id} />;
}
