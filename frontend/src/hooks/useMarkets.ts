import { useQuery } from "@tanstack/react-query";
import type { Market } from "../types/market";

async function fetchMarkets(): Promise<Market[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`);
  if (!res.ok) throw new Error("Failed to fetch markets");
  const data = await res.json();
  return data.markets ?? [];
}

export function useMarkets() {
  return useQuery<Market[]>({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    staleTime: 30_000,
  });
}
