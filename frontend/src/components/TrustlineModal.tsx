"use client";
/**
 * TrustlineModal
 *
 * Shown when a bet involves a custom Stellar asset the wallet hasn't trusted yet.
 * Provides a one-click "Set Up Trustline" button that triggers Freighter signing.
 *
 * States handled:
 *   needs_trustline  → prompt with asset info + action buttons
 *   signing          → "Waiting for Freighter approval..."
 *   submitting       → "Submitting to Stellar network..."
 *   wallet_missing   → connect wallet prompt
 *   horizon_error    → timeout message with retry button
 *   error            → generic error with dismiss
 */
import { TrustlineState } from "../hooks/useTrustline";
import { StellarAsset } from "../utils/trustline";

interface Props {
  state: TrustlineState;
  asset: StellarAsset | null;
  errorMessage: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  onConnect?: () => void;
}

export default function TrustlineModal({
  state,
  asset,
  errorMessage,
  onConfirm,
  onDismiss,
  onRetry,
  onConnect,
}: Props) {
  const visible = [
    "needs_trustline",
    "signing",
    "submitting",
    "wallet_missing",
    "horizon_error",
    "error",
  ].includes(state);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trustline required"
      data-testid="trustline-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">

        {/* Wallet missing */}
        {state === "wallet_missing" && (
          <>
            <ModalIcon type="wallet" />
            <ModalTitle>Wallet Not Connected</ModalTitle>
            <p className="text-gray-400 text-sm text-center">
              Connect your Freighter wallet to place bets.
            </p>
            <div className="flex flex-col gap-2">
              {onConnect && (
                <button
                  onClick={onConnect}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold text-sm transition-colors"
                >
                  Connect Freighter
                </button>
              )}
              <button onClick={onDismiss} className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Horizon timeout */}
        {state === "horizon_error" && (
          <>
            <ModalIcon type="warning" />
            <ModalTitle>Network Timeout</ModalTitle>
            <p className="text-gray-400 text-sm text-center">
              Could not reach Horizon. Check your connection and try again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onRetry}
                data-testid="trustline-retry"
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold text-sm transition-colors"
              >
                Retry
              </button>
              <button onClick={onDismiss} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Needs trustline */}
        {state === "needs_trustline" && asset && (
          <>
            <ModalIcon type="link" />
            <ModalTitle>Trustline Required</ModalTitle>
            <p className="text-gray-400 text-sm text-center">
              Your wallet needs to trust{" "}
              <span className="text-white font-semibold">{asset.code}</span> before betting.
              This is a one-time setup.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 break-all">
              <span className="text-gray-500">Issuer: </span>
              <span className="text-gray-300">{asset.issuer}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onConfirm}
                data-testid="trustline-confirm"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-sm transition-colors"
              >
                Set Up Trustline
              </button>
              <button
                onClick={onDismiss}
                data-testid="trustline-cancel"
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Signing / submitting */}
        {(state === "signing" || state === "submitting") && (
          <>
            <ModalIcon type="spinner" />
            <ModalTitle>
              {state === "signing" ? "Waiting for Freighter..." : "Submitting to Stellar..."}
            </ModalTitle>
            <p className="text-gray-400 text-sm text-center">
              {state === "signing"
                ? "Approve the trustline transaction in your Freighter wallet."
                : "Broadcasting your trustline to the Stellar testnet."}
            </p>
          </>
        )}

        {/* Generic error */}
        {state === "error" && (
          <>
            <ModalIcon type="error" />
            <ModalTitle>Something Went Wrong</ModalTitle>
            {errorMessage && (
              <p className="text-red-400 text-xs text-center bg-red-900/20 rounded-lg px-3 py-2">
                {errorMessage}
              </p>
            )}
            <button
              onClick={onDismiss}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 text-sm transition-colors"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ModalTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-white font-bold text-lg text-center">{children}</h2>;
}

function ModalIcon({ type }: { type: "wallet" | "link" | "warning" | "error" | "spinner" }) {
  const base = "w-12 h-12 rounded-full flex items-center justify-center mx-auto";
  if (type === "spinner") {
    return (
      <div className={`${base} bg-blue-900/40`}>
        <svg className="w-6 h-6 text-blue-400 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }
  const icons: Record<string, { bg: string; stroke: string; path: string }> = {
    wallet: {
      bg: "bg-indigo-900/40 border border-indigo-700",
      stroke: "text-indigo-400",
      path: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    },
    link: {
      bg: "bg-blue-900/40 border border-blue-700",
      stroke: "text-blue-400",
      path: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    },
    warning: {
      bg: "bg-yellow-900/40 border border-yellow-700",
      stroke: "text-yellow-400",
      path: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    },
    error: {
      bg: "bg-red-900/40 border border-red-700",
      stroke: "text-red-400",
      path: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  };
  const icon = icons[type];
  return (
    <div className={`${base} ${icon.bg}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`w-6 h-6 ${icon.stroke}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
      </svg>
    </div>
  );
}
