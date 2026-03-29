/**
 * useCancelBet
 *
 * React Query mutation for cancelling a bet via DELETE /api/bets/:id.
 * Handles refund amount extraction and cache invalidation.
 *
 * @param walletAddress - User's wallet address for authorization
 * @returns { mutate, isPending, error, data }
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface CancelBetResponse {
  success: boolean;
  bet_id: number;
  refunded_amount: string | number;
}

interface CancelBetInput {
  betId: number;
  walletAddress: string;
}

async function cancelBet({ betId, walletAddress }: CancelBetInput): Promise<CancelBetResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const res = await fetch(`${apiUrl}/api/bets/${betId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to cancel bet" }));
    throw new Error(error.error || "Failed to cancel bet");
  }

  return res.json();
}

export function useCancelBet(walletAddress: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (betId: number) => {
      if (!walletAddress) throw new Error("Wallet address required");
      return cancelBet({ betId, walletAddress });
    },
    onSuccess: () => {
      // Invalidate bet-related queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
