"use client";
/**
 * Step 1 — Connect Your Wallet
 * Shows a Freighter wallet connect button using the useWallet hook state.
 * If already connected, shows a success confirmation.
 */

interface Props {
  publicKey: string | null;
  isLoading: boolean;
  onConnect: () => void;
}

export default function StepWallet({ publicKey, isLoading, onConnect }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-indigo-400">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
          <circle cx="16" cy="14" r="1.5" fill="currentColor" />
        </svg>
      </div>

      <div>
        <h2 className="text-white font-bold text-xl">Connect Your Wallet</h2>
        <p className="text-gray-400 text-sm mt-2 max-w-sm">
          Stella Polymarket uses the{" "}
          <a href="https://freighter.app" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
            Freighter
          </a>{" "}
          browser extension to sign transactions on the Stellar network. No account needed — your wallet is your identity.
        </p>
      </div>

      {publicKey ? (
        <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/50 rounded-xl px-4 py-3 text-green-400 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Wallet connected: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={isLoading}
          data-testid="wizard-connect-button"
          className="w-full max-w-xs py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white font-semibold text-sm transition-colors"
        >
          {isLoading ? "Connecting…" : "Connect Freighter Wallet"}
        </button>
      )}

      <p className="text-gray-600 text-xs">
        Don't have Freighter?{" "}
        <a href="https://freighter.app" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
          Install it free
        </a>
      </p>
    </div>
  );
}
