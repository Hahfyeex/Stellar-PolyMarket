import { useQuery } from "@tanstack/react-query";

export interface MarketDetailData {
  market: {
    id: number;
    question: string;
    end_date: string;
    outcomes: string[];
    resolved: boolean;
    winning_outcome: number | null;
    total_pool: string;
    status: string;
    contract_address: string | null;
    created_at: string;
  };
  bets: {
    id: number;
    wallet_address: string;
    outcome_index: number;
    amount: string;
    created_at: string;
  }[];
}

async function fetchMarket(id: string): Promise<MarketDetailData> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${id}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to fetch market" }));
    throw new Error(error.error || "Failed to fetch market");
  }
  return res.json();
}

export function useMarket(id: string) {
  return useQuery<MarketDetailData>({
    queryKey: ["market", id],
    queryFn: () => fetchMarket(id),
    staleTime: 30_000,
    enabled: !!id,
  });
}
