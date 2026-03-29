"use client";
/**
 * BetCancellationButton
 *
 * Displays a Cancel button with countdown timer for bets within the grace period.
 * Shows "Locked" when grace period has expired.
 *
 * Props:
 *   - cancellableUntil: ISO string when cancellation window closes
 *   - onCancelClick: Callback when user clicks Cancel (before confirmation)
 *   - isLoading: Disable button during cancellation request
 *
 * States:
 *   - Cancellable: Shows "Cancel" button + countdown timer
 *   - Expired: Shows "Locked" badge
 *   - Loading: Shows spinner, button disabled
 */
import { useCountdownTimer } from "../hooks/useCountdownTimer";

interface Props {
  cancellableUntil: string | null;
  onCancelClick: () => void;
  isLoading?: boolean;
}

export default function BetCancellationButton({
  cancellableUntil,
  onCancelClick,
  isLoading = false,
}: Props) {
  const { formatted, isExpired } = useCountdownTimer(cancellableUntil);

  // No cancellation window
  if (!cancellableUntil) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-gray-400 text-xs font-medium">
        Locked
      </span>
    );
  }

  // Grace period expired
  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-gray-400 text-xs font-medium">
        Locked
      </span>
    );
  }

  // Cancellable with countdown
  return (
    <button
      onClick={onCancelClick}
      disabled={isLoading}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/50 text-red-400 text-xs font-medium hover:bg-red-600/30 hover:border-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      aria-label={`Cancel bet, ${formatted} remaining`}
    >
      {isLoading ? (
        <span className="inline-block w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
      ) : (
        <span className="text-xs">✕</span>
      )}
      <span className="text-xs font-semibold">{formatted}</span>
    </button>
  );
}
