import { useInfiniteQuery } from "@tanstack/react-query";
import type { Market } from "../types/market";

interface MarketsResponse {
  markets: Market[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

async function fetchMarketsInfinite({ pageParam = 0 }): Promise<MarketsResponse> {
  const limit = 10;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/markets?limit=${limit}&offset=${pageParam}`
  );
  if (!res.ok) throw new Error("Failed to fetch markets");
  return res.json();
}

/**
 * Hook for infinite scrolling through markets.
 * Uses offset-based pagination from the backend.
 * Closes #606
 */
export function useInfiniteMarkets() {
  return useInfiniteQuery<MarketsResponse>({
    queryKey: ["markets", "infinite"],
    queryFn: fetchMarketsInfinite,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.hasMore) {
        return lastPage.meta.offset + lastPage.meta.limit;
      }
      return undefined;
    },
    staleTime: 30_000,
  });
}
