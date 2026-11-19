import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildBetRequestBody, finalizeReferralAttribution } from "../lib/referral";
import type { MarketDetailData } from "./useMarket";

interface PlaceBetInput {
  marketId: number;
  outcomeIndex: number;
  amount: number;
  walletAddress: string;
}

/** Client-side id used to track an optimistic bet until the API confirms it. */
export type OptimisticBetId = `optimistic-${string}`;

/** A bet entry in the market detail cache, optionally still pending confirmation. */
export interface OptimisticBetEntry extends MarketDetailData["bets"][number] {
  optimisticId?: OptimisticBetId;
  status?: "pending" | "confirmed";
}

interface MarketDetailSnapshot {
  market: MarketDetailData["market"];
  bets: OptimisticBetEntry[];
}

interface PlaceBetContext {
  previous?: MarketDetailSnapshot;
  optimisticId?: OptimisticBetId;
}

export function makeOptimisticId(input: PlaceBetInput): OptimisticBetId {
  return `optimistic-${input.marketId}-${input.outcomeIndex}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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
  const marketKey = marketId !== undefined ? ["market", String(marketId)] : null;

  return useMutation({
    mutationFn: placeBet,
    onMutate: async (variables: PlaceBetInput): Promise<PlaceBetContext> => {
      if (!marketKey) return {};

      // Cancel in-flight refetches so they cannot overwrite the optimistic entry.
      await queryClient.cancelQueries({ queryKey: marketKey });

      const previous = queryClient.getQueryData<MarketDetailSnapshot>(marketKey);
      const optimisticId = makeOptimisticId(variables);

      if (previous) {
        const optimisticBet: OptimisticBetEntry = {
          id: -1,
          wallet_address: variables.walletAddress,
          outcome_index: variables.outcomeIndex,
          amount: String(variables.amount),
          created_at: new Date().toISOString(),
          optimisticId,
          status: "pending",
        };
        queryClient.setQueryData<MarketDetailSnapshot>(marketKey, {
          ...previous,
          bets: [optimisticBet, ...(previous.bets ?? [])],
        });
      }

      return { previous, optimisticId };
    },
    onError: (error, _variables, context) => {
      // Roll back the optimistic entry to the pre-mutation snapshot.
      if (marketKey && context?.previous) {
        queryClient.setQueryData<MarketDetailSnapshot>(marketKey, context.previous);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("bet:error", {
            detail: { message: (error as Error).message || "Failed to place bet" },
          })
        );
      }
    },
    onSuccess: (data, variables, context) => {
      finalizeReferralAttribution(variables.walletAddress);

      // Mark the optimistic entry as confirmed until the refetch replaces it.
      if (marketKey && context?.optimisticId) {
        const current = queryClient.getQueryData<MarketDetailSnapshot>(marketKey);
        if (current) {
          queryClient.setQueryData<MarketDetailSnapshot>(marketKey, {
            ...current,
            bets: (current.bets ?? []).map((bet) =>
              bet.optimisticId === context.optimisticId
                ? {
                    ...bet,
                    id: data?.bet?.id ?? bet.id,
                    status: "confirmed" as const,
                  }
                : bet
            ),
          });
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      if (marketKey) {
        queryClient.invalidateQueries({ queryKey: marketKey });
      }
    },
  });
}
