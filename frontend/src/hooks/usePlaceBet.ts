import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildBetRequestBody, finalizeReferralAttribution } from "../lib/referral";

interface PlaceBetInput {
  marketId: number;
  outcomeIndex: number;
  amount: number;
  walletAddress: string;
}

async function placeBet(data: PlaceBetInput) {
  const requestBody = buildBetRequestBody(data);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
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
    onSuccess: (_data, variables) => {
      finalizeReferralAttribution(variables.walletAddress);
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      if (marketId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["market", String(marketId)] });
      }
    },
  });
}
