/**
 * useTrustline
 *
 * Orchestrates the full trustline check → prompt → sign → submit → resume flow.
 *
 * Usage:
 *   const { checkAndRun } = useTrustline();
 *   // Wrap any bet submission:
 *   await checkAndRun({ code: "USDC", issuer: "GA5Z..." }, walletAddress, placeBet);
 *
 * Flow:
 *   1. If walletAddress is null → set state to "wallet_missing" (caller shows connect prompt)
 *   2. Call hasTrustline(wallet, asset)
 *      - On timeout/network error → set state to "horizon_error"
 *      - If trustline exists → call onProceed() directly (no modal needed)
 *      - If missing → set state to "needs_trustline" (modal shown by consumer)
 *   3. When user confirms in modal → buildTrustlineXdr → Freighter sign → submitTrustlineTx
 *   4. On success → call onProceed() to resume the original bet
 */
import { useState, useCallback } from "react";
import { hasTrustline, buildTrustlineXdr, submitTrustlineTx, StellarAsset } from "../utils/trustline";

export type TrustlineState =
  | "idle"
  | "checking"
  | "needs_trustline"
  | "signing"
  | "submitting"
  | "wallet_missing"
  | "horizon_error"
  | "error";

interface UseTrustlineResult {
  state: TrustlineState;
  pendingAsset: StellarAsset | null;
  errorMessage: string | null;
  /** Run trustline check; calls onProceed immediately if trustline exists */
  checkAndRun: (
    asset: StellarAsset,
    walletAddress: string | null,
    onProceed: () => Promise<void> | void
  ) => Promise<void>;
  /** Called by the modal "Set Up Trustline" button */
  confirmTrustline: () => Promise<void>;
  /** Called by the modal "Cancel" button */
  dismiss: () => void;
  /** Retry after a Horizon timeout */
  retry: () => void;
}

export function useTrustline(): UseTrustlineResult {
  const [state, setState] = useState<TrustlineState>("idle");
  const [pendingAsset, setPendingAsset] = useState<StellarAsset | null>(null);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [pendingOnProceed, setPendingOnProceed] = useState<(() => Promise<void> | void) | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkAndRun = useCallback(
    async (
      asset: StellarAsset,
      walletAddress: string | null,
      onProceed: () => Promise<void> | void
    ) => {
      setErrorMessage(null);

      // Edge case: wallet not connected
      if (!walletAddress) {
        setState("wallet_missing");
        return;
      }

      setState("checking");
      setPendingAsset(asset);
      setPendingWallet(walletAddress);
      // Store callback for later use after trustline setup
      setPendingOnProceed(() => onProceed);

      try {
        const trusted = await hasTrustline(walletAddress, asset);
        if (trusted) {
          // Trustline already exists — proceed directly, no modal needed
          setState("idle");
          await onProceed();
        } else {
          // Trustline missing — show modal
          setState("needs_trustline");
        }
      } catch (err: any) {
        const isTimeout = err.message?.includes("timed out");
        setState(isTimeout ? "horizon_error" : "error");
        setErrorMessage(err.message ?? "Unknown error");
      }
    },
    []
  );

  const confirmTrustline = useCallback(async () => {
    if (!pendingAsset || !pendingWallet) return;

    setState("signing");
    setErrorMessage(null);

    try {
      // Build the unsigned XDR
      const xdr = await buildTrustlineXdr(pendingWallet, pendingAsset);

      // Request Freighter signature
      if (!window.freighter) throw new Error("Freighter wallet not installed");
      const signedXdr = await window.freighter.signTransaction(xdr, {
        network: "TESTNET",
      });

      setState("submitting");

      // Submit to Horizon
      await submitTrustlineTx(signedXdr);

      // Trustline set — resume the original bet flow
      setState("idle");
      if (pendingOnProceed) await pendingOnProceed();
    } catch (err: any) {
      setState("error");
      setErrorMessage(err.message ?? "Failed to set up trustline");
    }
  }, [pendingAsset, pendingWallet, pendingOnProceed]);

  const dismiss = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    setPendingAsset(null);
    setPendingWallet(null);
    setPendingOnProceed(null);
  }, []);

  const retry = useCallback(() => {
    if (pendingAsset && pendingWallet && pendingOnProceed) {
      checkAndRun(pendingAsset, pendingWallet, pendingOnProceed);
    }
  }, [pendingAsset, pendingWallet, pendingOnProceed, checkAndRun]);

  return {
    state,
    pendingAsset,
    errorMessage,
    checkAndRun,
    confirmTrustline,
    dismiss,
    retry,
  };
}
