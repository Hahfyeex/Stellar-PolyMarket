import { useQuery } from "@tanstack/react-query";

interface PortfolioData {
  summary: {
    total_invested: string;
    total_payout: string;
    total_p_and_l: string;
    win_rate: string;
    total_bets: string;
    unique_markets: string;
  };
  recent_activity: Array<{
    bet_id: number;
    amount: string;
    outcome_index: number;
    outcome_name: string;
    market_id: number;
    market_question: string;
    is_resolved: boolean;
    winning_outcome: number | null;
    payout: string;
    created_at: string;
  }>;
}

export function usePortfolio(walletAddress: string | null) {
  return useQuery<PortfolioData>({
    queryKey: ["portfolio", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("Wallet not connected");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/portfolio/${walletAddress}`);
      if (!res.ok) {
        throw new Error("Failed to fetch portfolio data");
      }
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 30000, // 30 seconds
  });
}
