"use client";
/**
 * BetCancellationConfirmDialog
 *
 * Modal confirmation dialog for bet cancellation.
 * Shows bet details, refund amount, and requires explicit confirmation.
 *
 * Accessibility:
 *   - role="alertdialog" for semantic meaning
 *   - aria-labelledby for title
 *   - aria-describedby for description
 *   - Focus trap on confirm/cancel buttons
 */
import { useEffect, useRef } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
  betId: number;
  marketTitle: string;
  outcomeName: string;
  refundAmount: number;
}

export default function BetCancellationConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  error,
  betId,
  marketTitle,
  outcomeName,
  refundAmount,
}: Props) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-description"
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h2 id="cancel-dialog-title" className="text-lg font-bold text-white">
            Cancel Bet?
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 disabled:opacity-50 transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div id="cancel-dialog-description" className="space-y-4 mb-6">
          {/* Bet Details */}
          <div className="rounded-xl bg-gray-950 border border-gray-800 p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Market</p>
              <p className="text-sm font-medium text-white line-clamp-2 mt-1">{marketTitle}</p>
            </div>

            <div className="pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                Outcome
              </p>
              <p className="text-sm font-medium text-blue-400 mt-1">{outcomeName}</p>
            </div>

            <div className="pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                Refund Amount
              </p>
              <p className="text-lg font-bold text-green-400 mt-1">{refundAmount.toFixed(2)} XLM</p>
            </div>
          </div>

          {/* Warning Message */}
          <div className="rounded-lg bg-yellow-900/20 border border-yellow-700/50 p-3">
            <p className="text-sm text-yellow-200">
              You will receive a full refund of your stake. This action cannot be undone after the
              grace period expires.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-700/50 p-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Keep Bet
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Cancelling...
              </>
            ) : (
              "Cancel Bet"
            )}
          </button>
        </div>

        {/* Bet ID for reference */}
        <p className="text-xs text-gray-500 text-center mt-4">Bet ID: {betId}</p>
      </div>
    </div>
  );
}
