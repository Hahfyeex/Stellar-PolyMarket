import { useMutation, useQueryClient } from "@tanstack/react-query";

interface PlaceBetInput {
  marketId: number;
  outcomeIndex: number;
  amount: string; // integer stroop value as string (1 XLM = 10_000_000 stroops)
  walletAddress: string;
}

async function placeBet(data: PlaceBetInput) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to place bet" }));
    throw new Error(error.error || "Failed to place bet");
  }
  return res.json();
}

export function usePlaceBet(marketId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: placeBet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      if (marketId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["market", String(marketId)] });
      }
    },
  });
}
