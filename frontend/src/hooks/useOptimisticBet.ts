/**
 * useOptimisticBet
 *
 * Wraps a single bet submission with the full optimistic update pattern:
 *
 *   1. Dispatch addOptimisticBet → bet appears immediately with "pending" status
 *   2. Submit the bet to the API
 *   3a. On success → dispatch confirmBet, then clearBet after CONFIRM_DISPLAY_MS
 *   3b. On failure → dispatch rollbackBet (status = "failed", reason stored)
 *                  → show error toast via onError callback
 *                  → clearBet after ROLLBACK_DISPLAY_MS so the entry disappears
 *
 * Usage:
 *   const { submitBet, pendingBets } = useOptimisticBet();
 *   await submitBet({ marketId, outcomeIndex, outcomeName, marketTitle, amount, walletAddress });
 */
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addOptimisticBet,
  confirmBet,
  rollbackBet,
  clearBet,
  OptimisticBet,
} from "../store/optimisticBetsSlice";
import { RootState, AppDispatch } from "../store";
import { validateStellarAddress } from "../lib/stellar";

/** How long to show the confirmed state before removing the entry (ms) */
const CONFIRM_DISPLAY_MS = 2_000;
/** How long to show the failed state before removing the entry (ms) */
const ROLLBACK_DISPLAY_MS = 4_000;

export interface SubmitBetParams {
  marketId: number;
  marketTitle: string;
  outcomeIndex: number;
  outcomeName: string;
  amount: number;
  walletAddress: string;
}

interface UseOptimisticBetResult {
  /** All current optimistic bets (pending + confirmed + failed) */
  optimisticBets: OptimisticBet[];
  /** Bets for a specific market */
  betsForMarket: (marketId: number) => OptimisticBet[];
  /** Submit a bet with full optimistic update + rollback on failure */
  submitBet: (
    params: SubmitBetParams,
    onError?: (reason: string) => void
  ) => Promise<boolean>;
}

export function useOptimisticBet(): UseOptimisticBetResult {
  const dispatch = useDispatch<AppDispatch>();
  const optimisticBets = useSelector((s: RootState) => s.optimisticBets.bets);

  const betsForMarket = useCallback(
    (marketId: number) => optimisticBets.filter((b) => b.marketId === marketId),
    [optimisticBets]
  );

  const submitBet = useCallback(
    async (params: SubmitBetParams, onError?: (reason: string) => void): Promise<boolean> => {
      const { marketId, marketTitle, outcomeIndex, outcomeName, amount, walletAddress } = params;

      // Validate wallet address before submission
      if (!validateStellarAddress(walletAddress)) {
        const reason = "Invalid wallet address detected. Please reconnect your wallet.";
        onError?.(reason);
        return false;
      }

      // Generate a unique id for this optimistic entry
      const optimisticId = `${marketId}-${outcomeIndex}-${Date.now()}`;

      // ── Step 1: Optimistic add ────────────────────────────────────────────
      dispatch(
        addOptimisticBet({ optimisticId, marketId, marketTitle, outcomeIndex, outcomeName, amount })
      );

      try {
        // ── Step 2: Submit to API ─────────────────────────────────────────
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketId, outcomeIndex, amount, walletAddress }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Bet submission failed");

        // ── Step 3a: Confirm ──────────────────────────────────────────────
        dispatch(confirmBet({ optimisticId }));

        // Clean up the confirmed entry after a short display window
        setTimeout(() => dispatch(clearBet({ optimisticId })), CONFIRM_DISPLAY_MS);

        return true;
      } catch (err: any) {
        const reason: string = err.message ?? "Unknown error";

        // ── Step 3b: Rollback ─────────────────────────────────────────────
        dispatch(rollbackBet({ optimisticId, reason }));

        // Notify the caller so it can show a toast
        onError?.(reason);

        // Remove the failed entry after the toast display window
        setTimeout(() => dispatch(clearBet({ optimisticId })), ROLLBACK_DISPLAY_MS);

        return false;
      }
    },
    [dispatch]
  );

  return { optimisticBets, betsForMarket, submitBet };
}
