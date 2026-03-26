/**
 * useSlippageGuard
 *
 * Captures odds at bet-form-open time (via useRef) and checks for drift
 * just before submission using BigInt arithmetic.
 *
 * Flow:
 *   1. snapshotOdds(stake, outcomePool, totalPool) — call when form opens / outcome selected
 *   2. checkSlippage(stake, currentOutcomePool, currentTotalPool, tolerance)
 *      → returns { exceeded: false } if within tolerance
 *      → returns { exceeded: true, expectedPayout, currentPayout } if drift > tolerance
 */
import { useRef, useCallback } from "react";
import { calcPayoutStroops, isSlippageExceeded, toStroops, stroopsToXlm } from "../utils/slippageCalc";

export interface SlippageCheckResult {
  exceeded: boolean;
  /** Expected payout in XLM (at snapshot time) */
  expectedPayout: number;
  /** Current payout in XLM (at check time) */
  currentPayout: number;
}

export function useSlippageGuard() {
  // Store the payout snapshot as a BigInt stroop value in a ref (no re-render on update)
  const snapshotRef = useRef<bigint>(0n);

  /**
   * Capture the expected payout at the moment the user opens the bet form
   * or selects an outcome. Called with the current pool state.
   */
  const snapshotOdds = useCallback(
    (stake: number, outcomePool: number, totalPool: number) => {
      snapshotRef.current = calcPayoutStroops(
        toStroops(stake),
        toStroops(outcomePool),
        toStroops(totalPool)
      );
    },
    []
  );

  /**
   * Compare the snapshot payout against the current payout.
   * Returns exceeded=true with both payouts if drift exceeds tolerance.
   */
  const checkSlippage = useCallback(
    (
      stake: number,
      currentOutcomePool: number,
      currentTotalPool: number,
      tolerancePct: number
    ): SlippageCheckResult => {
      const currentStroops = calcPayoutStroops(
        toStroops(stake),
        toStroops(currentOutcomePool),
        toStroops(currentTotalPool)
      );

      const exceeded = isSlippageExceeded(
        snapshotRef.current,
        currentStroops,
        tolerancePct
      );

      return {
        exceeded,
        expectedPayout: stroopsToXlm(snapshotRef.current),
        currentPayout: stroopsToXlm(currentStroops),
      };
    },
    []
  );

  return { snapshotOdds, checkSlippage };
}
