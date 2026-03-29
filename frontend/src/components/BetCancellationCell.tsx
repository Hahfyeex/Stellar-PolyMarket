"use client";
/**
 * BetCancellationCell
 *
 * Integrated cancellation UI for a single bet row.
 * Manages the full cancellation flow:
 *   1. Show Cancel button with countdown (if within grace period)
 *   2. Open confirmation dialog on click
 *   3. Submit cancellation request
 *   4. Show success/error toast
 *   5. Refresh bet list
 *
 * Props:
 *   - betId: Unique bet identifier
 *   - cancellableUntil: ISO string when cancellation window closes
 *   - marketTitle: Market question text
 *   - outcomeName: Outcome the user bet on
 *   - refundAmount: Amount to be refunded
 *   - walletAddress: User's wallet for authorization
 *   - onCancellationSuccess: Callback after successful cancellation
 */
import { useState } from "react";
import { useCancelBet } from "../hooks/useCancelBet";
import { useToast } from "./ToastProvider";
import BetCancellationButton from "./BetCancellationButton";
import BetCancellationConfirmDialog from "./BetCancellationConfirmDialog";

interface Props {
  betId: number;
  cancellableUntil: string | null;
  marketTitle: string;
  outcomeName: string;
  refundAmount: number;
  walletAddress: string | null;
  onCancellationSuccess?: () => void;
}

export default function BetCancellationCell({
  betId,
  cancellableUntil,
  marketTitle,
  outcomeName,
  refundAmount,
  walletAddress,
  onCancellationSuccess,
}: Props) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { mutate: cancelBet, isPending, error } = useCancelBet(walletAddress);
  const { success, error: showError } = useToast();

  const handleCancelClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmCancellation = async () => {
    cancelBet(betId, {
      onSuccess: (data) => {
        setShowConfirmDialog(false);
        success(`Bet cancelled. Refund: ${parseFloat(data.refunded_amount).toFixed(2)} XLM`);
        onCancellationSuccess?.();
      },
      onError: (err) => {
        showError(err.message || "Failed to cancel bet");
      },
    });
  };

  return (
    <>
      <BetCancellationButton
        cancellableUntil={cancellableUntil}
        onCancelClick={handleCancelClick}
        isLoading={isPending}
      />

      <BetCancellationConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmCancellation}
        isLoading={isPending}
        error={error?.message || null}
        betId={betId}
        marketTitle={marketTitle}
        outcomeName={outcomeName}
        refundAmount={refundAmount}
      />
    </>
  );
}
