"use client";
/**
 * BettingSlip
 *
 * Slide-up drawer (mobile) / fixed right panel (desktop) for queuing multiple bets.
 * Allows users to batch up to MAX_BETS bets into a single Freighter approval.
 *
 * Responsive behavior:
 *   - Mobile (<1024px): slide-up drawer from bottom with CSS transform: translateY
 *   - Desktop (≥1024px): fixed right-side panel
 *
 * State transitions:
 *   - open/close → controlled by BettingSlipContext
 *   - removeBet → removes individual bet from queue
 *   - submitBatch → bundles all bets into one Stellar transaction via useBatchTransaction
 */
import { useBettingSlip, MAX_BETS } from "../context/BettingSlipContext";
import { useBatchTransaction } from "../hooks/useBatchTransaction";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

interface Props {
  walletAddress: string | null;
  onBatchPlaced?: () => void;
}

export default function BettingSlip({ walletAddress, onBatchPlaced }: Props) {
  const { isOpen, bets, close, removeBet, clearBets } = useBettingSlip();
  const { submitting, error, submitBatch } = useBatchTransaction(() => {
    clearBets();
    onBatchPlaced?.();
  });
  const isOnline = useOnlineStatus();

  async function handleSubmit() {
    if (!walletAddress || !bets.length) return;
    await submitBatch(bets, walletAddress);
  }

  const totalAmount = bets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <>
      {/* Backdrop — mobile only */}
      {isOpen && (
        <div
          data-testid="betting-slip-backdrop"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={close}
        />
      )}

      {/* Drawer/Panel */}
      <div
        data-testid="betting-slip"
        className={`
          fixed z-50 bg-gray-900 border-gray-800
          
          /* Mobile: slide-up drawer from bottom */
          lg:hidden bottom-0 left-0 right-0 rounded-t-2xl border-t
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-y-0" : "translate-y-full"}
          
          /* Desktop: fixed right panel */
          lg:block lg:top-0 lg:right-0 lg:bottom-0 lg:w-80 lg:border-l lg:rounded-none
          lg:translate-y-0
          ${isOpen ? "lg:translate-x-0" : "lg:translate-x-full"}
        `}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div>
            <h3 className="text-white font-semibold text-lg">Betting Slip</h3>
            <p className="text-gray-400 text-xs">
              {bets.length} / {MAX_BETS} bets queued
            </p>
          </div>
          <button
            data-testid="close-slip"
            onClick={close}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close betting slip"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Bet list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[50vh] lg:max-h-[calc(100vh-200px)]">
          {bets.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              No bets queued yet. Add bets from any market to batch them together.
            </p>
          ) : (
            bets.map((bet) => (
              <div
                key={bet.id}
                data-testid={`queued-bet-${bet.id}`}
                className="bg-gray-800 rounded-lg p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{bet.marketTitle}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Outcome: <span className="text-blue-400">{bet.outcomeName}</span>
                  </p>
                  <p className="text-gray-400 text-xs">
                    Amount: <span className="text-white font-medium">{bet.amount} XLM</span>
                  </p>
                </div>
                <button
                  data-testid={`remove-bet-${bet.id}`}
                  onClick={() => removeBet(bet.id)}
                  className="text-red-400 hover:text-red-300 transition-colors shrink-0"
                  aria-label={`Remove bet on ${bet.marketTitle}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {bets.length > 0 && (
          <div className="border-t border-gray-800 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total stake:</span>
              <span className="text-white font-semibold" data-testid="total-stake">
                {totalAmount.toFixed(2)} XLM
              </span>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-900/30 px-3 py-2 rounded-lg" data-testid="batch-error">
                {error}
              </p>
            )}

            {walletAddress ? (
              <div className="relative group">
                <button
                  data-testid="submit-batch"
                  onClick={handleSubmit}
                  disabled={submitting || bets.length === 0 || !isOnline}
                  aria-disabled={!isOnline}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl text-sm font-bold transition-colors"
                >
                  {submitting ? "Submitting..." : `Place ${bets.length} Bet${bets.length > 1 ? "s" : ""}`}
                </button>
                {!isOnline && (
                  <div
                    role="tooltip"
                    data-testid="offline-bet-tooltip"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--status-warning)" }}
                  >
                    You&apos;re offline — bet submission unavailable
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-xs text-center py-2">
                Connect your wallet to submit bets
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
