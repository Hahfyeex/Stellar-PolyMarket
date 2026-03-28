import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MarketDetailPage from "../../market/[id]/MarketDetailPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stellapolymarket.com";

interface Market {
  id: number;
  question: string;
  total_pool: string;
  outcomes: string[];
  end_date: string;
}

async function fetchMarket(id: string): Promise<Market | null> {
  try {
    const res = await fetch(`${API_URL}/api/markets/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.market ?? data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const market = await fetchMarket(params.id);
  if (!market) return { title: "Market Not Found" };

  const pool = parseFloat(market.total_pool).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  const odds = market.outcomes
    .map((o) => `${o}: ${(100 / market.outcomes.length).toFixed(0)}%`)
    .join(" · ");
  const description = `${odds} · Pool: ${pool} XLM`;
  const canonicalUrl = `${SITE_URL}/markets/${market.id}`;
  const ogImage = `${SITE_URL}/api/og?id=${market.id}`;

  return {
    title: market.question,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: market.question,
      description,
      url: canonicalUrl,
      images: [{ url: ogImage }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: market.question,
      description,
      images: [ogImage],
    },
  };
}

export default async function MarketsDetailPage({ params }: { params: { id: string } }) {
  const market = await fetchMarket(params.id);
  if (!market) notFound();

  // MarketDetailPage is a client component — wrap with a fresh QueryClient
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <MarketDetailPage marketId={params.id} />
    </QueryClientProvider>
  );
}
