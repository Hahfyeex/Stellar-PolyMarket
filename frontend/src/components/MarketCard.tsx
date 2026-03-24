import { useState } from "react";
import type { Market } from "../types/market";
import ResolutionCenter from "./ResolutionCenter";

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
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-4 border border-gray-800">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-white text-lg leading-snug">{market.question}</h3>
        {market.resolved ? (
          <span className="text-xs bg-green-800 text-green-300 px-2 py-1 rounded-full">Resolved</span>
        ) : isExpired ? (
          <span className="text-xs bg-yellow-800 text-yellow-300 px-2 py-1 rounded-full">Ended</span>
        ) : (
          <span className="text-xs bg-blue-800 text-blue-300 px-2 py-1 rounded-full">Live</span>
        )}
      </div>

      <p className="text-gray-400 text-sm">
        Pool: <span className="text-white font-medium">{parseFloat(market.total_pool).toFixed(2)} XLM</span>
        &nbsp;·&nbsp;Ends: {new Date(market.end_date).toLocaleDateString()}
      </p>

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

      <ResolutionCenter market={market} compact />
    </div>
  );
}
