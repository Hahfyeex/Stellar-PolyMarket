import { useState } from "react";
import { trackEvent } from "../lib/firebase";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  pool_depth?: Record<string, number>;
}

import LiquidityHeatmap from "./LiquidityHeatmap";

interface Props {
  market: Market;
  walletAddress: string | null;
  onBetPlaced?: () => void;
}

export default function MarketCard({ market, walletAddress, onBetPlaced }: Props) {
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
      onBetPlaced?.();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-white text-lg leading-snug flex-1">{market.question}</h3>
        <div className="flex items-center gap-2">
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

      {/* Outcomes */}
      <div className="flex gap-2 flex-wrap">
        {market.outcomes.map((outcome, i) => (
          <div key={i} className="relative">
            <button
              onClick={() => setSelectedOutcome(i)}
              disabled={market.resolved || isExpired}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative z-10
                ${market.resolved && market.winning_outcome === i
                  ? "bg-green-600 text-white"
                  : selectedOutcome === i
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
            >
              {outcome}
            </button>
            <LiquidityHeatmap 
              poolDepth={market.pool_depth || {}} 
              totalPool={parseFloat(market.total_pool || "0")} 
              outcomeIndex={i} 
            />
          </div>
        ))}
      </div>

      {/* Bet input */}
      {!market.resolved && !isExpired && walletAddress && (
        <div className="flex gap-2 mt-1">
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
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
