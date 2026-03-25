/**
 * useBatchTransaction
 *
 * Bundles all queued bets into a single Freighter wallet approval.
 *
 * Flow:
 *   1. POST /api/bets/batch with the full bets array → backend builds & returns a Stellar XDR
 *   2. Pass XDR to window.freighter.signTransaction → single user approval
 *   3. POST /api/bets/submit with the signed XDR → backend submits to Stellar network
 *
 * On success: clears the queue and calls onSuccess callback.
 * On error:   surfaces the error message via the returned `error` state.
 */
import { useState, useCallback } from "react";
import { QueuedBet } from "../context/BettingSlipContext";

interface UseBatchTransactionResult {
  submitting: boolean;
  error: string | null;
  success: boolean;
  submitBatch: (bets: QueuedBet[], walletAddress: string) => Promise<boolean>;
}

export function useBatchTransaction(
  onSuccess?: () => void
): UseBatchTransactionResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submitBatch = useCallback(
    async (bets: QueuedBet[], walletAddress: string): Promise<boolean> => {
      if (!bets.length) return false;

      setSubmitting(true);
      setError(null);
      setSuccess(false);

      try {
        // Step 1: Ask backend to build a batched Stellar transaction XDR
        const buildRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/bets/batch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress,
              bets: bets.map((b) => ({
                marketId: b.marketId,
                outcomeIndex: b.outcomeIndex,
                amount: b.amount,
              })),
            }),
          }
        );

        const buildData = await buildRes.json();
        if (!buildRes.ok) throw new Error(buildData.error ?? "Failed to build transaction");

        const { xdr } = buildData as { xdr: string };

        // Step 2: Request single Freighter approval for the batched XDR
        if (!window.freighter) throw new Error("Freighter wallet not installed");
        const signedXdr = await window.freighter.signTransaction(xdr, {
          network: "TESTNET",
        });

        // Step 3: Submit the signed transaction to the network via backend
        const submitRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/bets/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signedXdr, walletAddress }),
          }
        );

        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error ?? "Failed to submit transaction");

        setSuccess(true);
        onSuccess?.();
        return true;
      } catch (err: any) {
        setError(err.message ?? "Unknown error");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [onSuccess]
  );

  return { submitting, error, success, submitBatch };
}
