import { useQuery } from "@tanstack/react-query";
import type { Market } from "../types/market";

interface TrendingMarket extends Market {
  volume_24h: string;
  bet_count: number;
}

async function fetchTrendingMarkets(): Promise<TrendingMarket[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/markets/trending?limit=6`
  );
  if (!res.ok) throw new Error("Failed to fetch trending markets");
  const data = await res.json();
  // trending endpoint returns { markets: [...] } or flat array
  return (data.markets ?? data) as TrendingMarket[];
}

export function useTrendingMarkets() {
  return useQuery<TrendingMarket[]>({
    queryKey: ["markets", "trending"],
    queryFn: fetchTrendingMarkets,
    staleTime: 60_000,
  });
}
