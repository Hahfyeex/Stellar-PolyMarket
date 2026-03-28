"use client";
/**
 * OptimisticBetIndicator
 *
 * Displays a list of pending/confirmed/failed optimistic bets for a market.
 * Shown inline inside MarketCard below the bet input.
 *
 * States:
 *   pending   — pulsing yellow dot + "Submitting…"
 *   confirmed — green dot + "Confirmed"
 *   failed    — red dot + failure reason (truncated)
 */
import { OptimisticBet } from "../store/optimisticBetsSlice";

interface Props {
  bets: OptimisticBet[];
}

export default function OptimisticBetIndicator({ bets }: Props) {
  if (!bets.length) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1" data-testid="optimistic-bet-indicator">
      {bets.map((bet) => (
        <div
          key={bet.optimisticId}
          data-testid={`optimistic-bet-${bet.status}`}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
            bet.status === "pending"
              ? "bg-yellow-900/20 border-yellow-800/50 text-yellow-300"
              : bet.status === "confirmed"
              ? "bg-green-900/20 border-green-800/50 text-green-300"
              : "bg-red-900/20 border-red-800/50 text-red-300"
          }`}
        >
          {/* Status dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              bet.status === "pending"
                ? "bg-yellow-400 animate-pulse"
                : bet.status === "confirmed"
                ? "bg-green-400"
                : "bg-red-400"
            }`}
          />

          {/* Label */}
          <span className="font-medium">
            {bet.outcomeName} · {bet.amount.toFixed(2)} XLM
          </span>

          {/* Status text */}
          <span className="ml-auto shrink-0">
            {bet.status === "pending" && "Submitting…"}
            {bet.status === "confirmed" && "Confirmed ✓"}
            {bet.status === "failed" && (
              <span title={bet.failureReason ?? "Failed"}>
                Failed — {(bet.failureReason ?? "error").slice(0, 40)}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
