"use client";
/**
 * SlippageWarningModal
 *
 * Shown when the current payout has drifted beyond the user's tolerance.
 * Displays expected vs current payout and lets the user Proceed or Cancel.
 */
interface Props {
  expectedPayout: number;
  currentPayout: number;
  tolerancePct: number;
  onProceed: () => void;
  onCancel: () => void;
}

export default function SlippageWarningModal({
  expectedPayout,
  currentPayout,
  tolerancePct,
  onProceed,
  onCancel,
}: Props) {
  const driftPct = expectedPayout > 0
    ? ((expectedPayout - currentPayout) / expectedPayout) * 100
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slippage warning"
      data-testid="slippage-warning-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-gray-900 border border-yellow-700/60 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-yellow-900/40 border border-yellow-700 flex items-center justify-center mx-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-yellow-400">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-white font-bold text-lg text-center">Slippage Warning</h2>

        <p className="text-gray-400 text-sm text-center">
          Odds have moved <span className="text-yellow-400 font-semibold">{driftPct.toFixed(2)}%</span> since
          you opened this bet, exceeding your <span className="text-white">{tolerancePct}%</span> tolerance.
        </p>

        {/* Payout comparison */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Expected payout</span>
            <span className="text-white font-medium" data-testid="expected-payout">
              {expectedPayout.toFixed(7)} XLM
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Current payout</span>
            <span className="text-red-400 font-medium" data-testid="current-payout">
              {currentPayout.toFixed(7)} XLM
            </span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-2">
            <span className="text-gray-400">Difference</span>
            <span className="text-red-400 font-semibold" data-testid="payout-diff">
              -{(expectedPayout - currentPayout).toFixed(7)} XLM
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            data-testid="slippage-proceed"
            onClick={onProceed}
            className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 rounded-xl text-white font-semibold text-sm transition-colors"
          >
            Proceed Anyway
          </button>
          <button
            data-testid="slippage-cancel"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
