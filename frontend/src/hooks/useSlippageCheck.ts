/**
 * useSlippageCheck
 *
 * Fetches the current market odds from the API and compares them to the
 * odds captured when the user first entered their bet amount.
 * All comparisons use BigInt stroop arithmetic — zero floating-point.
 *
 * Usage:
 *   const { checkSlippage, slippageState, dismiss } = useSlippageCheck();
 *
 *   // Before submitting:
 *   const ok = await checkSlippage({ marketId, outcomeIndex, stakeXlm, expectedPayoutXlm, tolerancePct });
 *   if (ok) submitBet();
 *   // If not ok, slippageState.exceeded === true and the warning modal should be shown.
 *   // Call dismiss() to reset after the user cancels.
 */
import { useState, useCallback } from "react";
import {
  toStroops,
  calcPayoutStroops,
  isSlippageExceeded,
  stroopsToXlm,
} from "../utils/slippageCalc";

export interface SlippageCheckParams {
  marketId: number;
  outcomeIndex: number;
  stakeXlm: number;
  /** Payout calculated when the user first entered the amount */
  expectedPayoutXlm: number;
  tolerancePct: number;
}

export interface SlippageState {
  exceeded: boolean;
  expectedPayout: number;
  currentPayout: number;
  tolerancePct: number;
}

interface UseSlippageCheckResult {
  /**
   * Fetch current odds and compare to expected payout.
   * Returns true if slippage is within tolerance (safe to proceed).
   * Returns false if slippage exceeded — caller should show the warning modal.
   */
  checkSlippage: (params: SlippageCheckParams) => Promise<boolean>;
  /** Non-null when slippage has been exceeded and the modal should be shown */
  slippageState: SlippageState | null;
  /** Reset slippage state (call when user cancels the warning modal) */
  dismiss: () => void;
  checking: boolean;
}

interface MarketPoolData {
  total_pool: string;
  outcomes: string[];
  bets?: { outcome_index: number; amount: string }[];
}

/**
 * Derive per-outcome pool from the market's bets array.
 * Falls back to equal split when bets are unavailable.
 */
function outcomePoolXlm(data: MarketPoolData, outcomeIndex: number): number {
  const totalPool = parseFloat(data.total_pool) || 0;
  const numOutcomes = data.outcomes.length || 2;

  if (!data.bets?.length) {
    // No bet history — assume equal split
    return totalPool / numOutcomes;
  }

  const poolForOutcome = data.bets
    .filter((b) => b.outcome_index === outcomeIndex)
    .reduce((sum, b) => sum + parseFloat(b.amount), 0);

  return poolForOutcome;
}

export function useSlippageCheck(): UseSlippageCheckResult {
  const [slippageState, setSlippageState] = useState<SlippageState | null>(null);
  const [checking, setChecking] = useState(false);

  const checkSlippage = useCallback(
    async ({
      marketId,
      outcomeIndex,
      stakeXlm,
      expectedPayoutXlm,
      tolerancePct,
    }: SlippageCheckParams): Promise<boolean> => {
      setChecking(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}`
        );
        if (!res.ok) {
          // If we can't fetch current odds, allow the bet through
          return true;
        }
        const data: MarketPoolData = await res.json();

        const totalPool = parseFloat(data.total_pool) || 0;
        const outcomePool = outcomePoolXlm(data, outcomeIndex);

        // All comparisons in BigInt stroops — zero floating-point
        const stakeStroops = toStroops(stakeXlm);
        const outcomePoolStroops = toStroops(outcomePool);
        const totalPoolStroops = toStroops(totalPool);
        const expectedStroops = toStroops(expectedPayoutXlm);

        const currentStroops = calcPayoutStroops(
          stakeStroops,
          outcomePoolStroops,
          totalPoolStroops
        );

        const exceeded = isSlippageExceeded(expectedStroops, currentStroops, tolerancePct);

        if (exceeded) {
          setSlippageState({
            exceeded: true,
            expectedPayout: expectedPayoutXlm,
            currentPayout: stroopsToXlm(currentStroops),
            tolerancePct,
          });
          return false;
        }

        return true;
      } catch {
        // Network error — allow the bet through rather than blocking the user
        return true;
      } finally {
        setChecking(false);
      }
    },
    []
  );

  const dismiss = useCallback(() => setSlippageState(null), []);

  return { checkSlippage, slippageState, dismiss, checking };
}
