import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "../lib/firebase";
import WhatIfSimulator from "./WhatIfSimulator";
import { useBettingSlip } from "../context/BettingSlipContext";
import Toast from "./Toast";
import PoolOwnershipChart from "./PoolOwnershipChart";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { useTrustline } from "../hooks/useTrustline";
import TrustlineModal from "./TrustlineModal";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  /** Optional custom asset required to bet on this market */
  asset?: { code: string; issuer: string };
}

interface Props {
  market: Market;
  walletAddress: string | null;
  onBetPlaced?: () => void;
}

export default function MarketCard({ market, walletAddress, onBetPlaced }: Props) {
  const {
    outcomeIndex: selectedOutcome,
    amount,
    slippageTolerance,
    setOutcomeIndex: setSelectedOutcome,
    setAmount,
    setSlippageTolerance,
    clearForm,
  } = useFormPersistence(market.id);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showQueueFullToast, setShowQueueFullToast] = useState(false);

  const { addBet } = useBettingSlip();
  const { state: trustlineState, pendingAsset, errorMessage: trustlineError,
          checkAndRun, confirmTrustline, dismiss: dismissTrustline, retry: retryTrustline } = useTrustline();
  const isExpired = new Date(market.end_date) <= new Date();

  const handleShareMarket = async () => {
    const shareData = {
      title: market.question,
      text: `Check out this prediction market: ${market.question}\nPool: ${parseFloat(market.total_pool).toFixed(2)} XLM`,
      url: `${window.location.origin}?market=${market.id}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent('share_market', {
          market_id: market.id,
          share_method: 'native_share_api',
          market_question: market.question.substring(0, 50), // Truncate for privacy
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        trackEvent('share_market', {
          market_id: market.id,
          share_method: 'clipboard',
          market_question: market.question.substring(0, 50), // Truncate for privacy
        });
        setMessage("Market link copied to clipboard!");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      trackEvent('share_error', {
        market_id: market.id,
        error_message: err instanceof Error ? err.message.substring(0, 100) : 'Unknown error',
      });
    }
  };

  async function placeBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;

    // If this market uses a custom asset, run the trustline check first.
    // checkAndRun will call the inner function directly if trustline exists,
    // or show the modal and resume after the user sets it up.
    if (market.asset) {
      await checkAndRun(market.asset, walletAddress, submitBet);
    } else {
      await submitBet();
    }
  }

  async function submitBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          outcomeIndex: selectedOutcome,
          amount: parseFloat(amount),
          walletAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Bet placed successfully!");
      clearForm();
      onBetPlaced?.();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800">
      {/* Trustline modal — rendered at card level, portal-like via fixed positioning */}
      <TrustlineModal
        state={trustlineState}
        asset={pendingAsset}
        errorMessage={trustlineError}
        onConfirm={confirmTrustline}
        onDismiss={dismissTrustline}
        onRetry={retryTrustline}
      />
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-white text-lg leading-snug flex-1">{market.question}</h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/markets/${market.id}`}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title="View market details"
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </Link>
          <button
            onClick={handleShareMarket}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title="Share market"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
            </svg>
          </button>
          {market.resolved ? (
            <span className="text-xs bg-green-800 text-green-300 px-2 py-1 rounded-full">Resolved</span>
          ) : isExpired ? (
            <span className="text-xs bg-yellow-800 text-yellow-300 px-2 py-1 rounded-full">Ended</span>
          ) : (
            <span className="text-xs bg-blue-800 text-blue-300 px-2 py-1 rounded-full">Live</span>
          )}
        </div>
      </div>

      <p className="text-gray-400 text-sm">
        Pool: <span className="text-white font-medium">{parseFloat(market.total_pool).toFixed(2)} XLM</span>
        &nbsp;·&nbsp;Ends: {new Date(market.end_date).toLocaleDateString()}
      </p>

      {/* Pool ownership pie chart — live updates via WebSocket */}
      <PoolOwnershipChart marketId={market.id} />

      {/* Outcomes */}
      <div className="flex gap-2 flex-wrap">
        {market.outcomes.map((outcome, i) => (
          <button
            key={i}
            onClick={() => setSelectedOutcome(i)}
            disabled={market.resolved || isExpired}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${market.resolved && market.winning_outcome === i
                ? "bg-green-600 text-white"
                : selectedOutcome === i
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
          >
            {outcome}
          </button>
        ))}
      </div>

      {/* Bet input */}
      {!market.resolved && !isExpired && walletAddress && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount (XLM)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm flex-1 outline-none border border-gray-700 focus:border-blue-500"
            />
            <button
              onClick={placeBet}
              disabled={loading || selectedOutcome === null || !amount}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {loading ? "Placing..." : "Bet"}
            </button>
            {/* Add to betting slip queue */}
            <button
              data-testid="add-to-slip"
              onClick={() => {
                if (selectedOutcome === null || !amount) return;
                addBet(
                  {
                    marketId: market.id,
                    marketTitle: market.question,
                    outcomeIndex: selectedOutcome,
                    outcomeName: market.outcomes[selectedOutcome],
                    amount: parseFloat(amount),
                  },
                  () => setShowQueueFullToast(true)
                );
              }}
              disabled={selectedOutcome === null || !amount}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
              title="Add to betting slip"
            >
              + Slip
            </button>
          </div>

          {/* Slippage tolerance + clear form row */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-400">
              Slippage
              <select
                data-testid="slippage-select"
                value={slippageTolerance}
                onChange={(e) => setSlippageTolerance(parseFloat(e.target.value))}
                className="bg-gray-800 text-white rounded px-2 py-1 text-xs border border-gray-700 outline-none"
              >
                <option value={0.1}>0.1%</option>
                <option value={0.5}>0.5%</option>
                <option value={1}>1%</option>
                <option value={2}>2%</option>
              </select>
            </label>
            <button
              data-testid="clear-form"
              onClick={() => { clearForm(); setMessage(""); }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear form
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {message}
        </p>
      )}

      {/* Queue-full toast */}
      {showQueueFullToast && (
        <Toast
          message={`Betting slip is full (max ${5} bets). Remove one to add more.`}
          type="warning"
          onDismiss={() => setShowQueueFullToast(false)}
        />
      )}

      {/* What-If Simulator — shown when an outcome is selected */}
      {!market.resolved && !isExpired && selectedOutcome !== null && (
        <WhatIfSimulator
          poolForOutcome={parseFloat(market.total_pool) / market.outcomes.length}
          totalPool={parseFloat(market.total_pool)}
        />
      )}
    </div>
  );
}
