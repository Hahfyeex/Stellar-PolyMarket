"use client";
/**
 * PayoutTooltip
 *
 * Small popup that shows "Estimated Payout" and "Network Fee" derived from
 * a live Soroban simulateTransaction call. Appears anchored below the bet
 * amount input and updates dynamically as the user types.
 *
 * Staleness: if the ledger has advanced since the last simulation, a subtle
 * "Refreshing..." badge is shown so users know the figure may be slightly off
 * while the next simulation is in-flight.
 */
import React from "react";
import { useSimulateBet } from "../hooks/useSimulateBet";
import { formatXlm } from "../utils/simulateBet";

interface Props {
  contractId: string | null;
  walletAddress: string | null;
  marketId: number;
  outcomeIndex: number | null;
  stakeAmount: number;
  poolForOutcome: number;
  totalPool: number;
}

export default function PayoutTooltip({
  contractId,
  walletAddress,
  marketId,
  outcomeIndex,
  stakeAmount,
  poolForOutcome,
  totalPool,
}: Props) {
  const { result, simulating, isStale } = useSimulateBet({
    contractId,
    walletAddress,
    marketId,
    outcomeIndex,
    stakeAmount,
    poolForOutcome,
    totalPool,
  });

  // Don't render until we have something to show
  if (!stakeAmount || outcomeIndex === null) return null;
  if (!simulating && !result) return null;

  return (
    <div
      data-testid="payout-tooltip"
      className="rounded-xl border border-gray-700 bg-gray-800/95 backdrop-blur-sm px-4 py-3 text-xs shadow-lg space-y-2"
      role="status"
      aria-live="polite"
      aria-label="Estimated payout information"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-gray-400 font-medium">Estimated Payout</span>
        {(simulating || isStale) && (
          <span
            data-testid="refreshing-badge"
            className="text-yellow-400 text-[10px] animate-pulse"
          >
            Refreshing…
          </span>
        )}
      </div>

      {result?.success === false && result.error ? (
        /* Error state */
        <p data-testid="sim-error" className="text-red-400">
          {result.error}
        </p>
      ) : (
        <>
          {/* Estimated payout */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400">If you win</span>
            <span
              data-testid="estimated-payout"
              className="text-green-400 font-semibold tabular-nums"
            >
              {result ? formatXlm(result.estimatedPayout) : "—"}
            </span>
          </div>

          {/* Net profit */}
          {result && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Net profit</span>
              <span
                data-testid="net-profit"
                className={`font-semibold tabular-nums ${
                  result.estimatedPayout - stakeAmount >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {result.estimatedPayout - stakeAmount >= 0 ? "+" : ""}
                {formatXlm(result.estimatedPayout - stakeAmount)}
              </span>
            </div>
          )}

          {/* Network fee */}
          <div className="flex items-center justify-between border-t border-gray-700 pt-2">
            <span className="text-gray-400">Network fee</span>
            <span
              data-testid="network-fee"
              className="text-gray-300 tabular-nums"
            >
              {result ? formatXlm(result.networkFeeXlm) : "—"}
            </span>
          </div>
        </>
      )}

      <p className="text-gray-600 text-[10px] leading-tight">
        Simulated via Soroban RPC · 3% platform fee applied · not a guarantee
      </p>
    </div>
  );
}
