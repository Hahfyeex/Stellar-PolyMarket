"use client";
import { useRef, useState, useEffect } from "react";
import { trackEvent } from "../../lib/firebase";
import WhatIfSimulator from "../WhatIfSimulator";
import { useFormPersistence } from "../../hooks/useFormPersistence";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
}

interface Props {
  market: Market | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string | null;
  onBetPlaced?: () => void;
}

const CLOSE_THRESHOLD_RATIO = 0.3;

export default function TradeDrawer({ market, open, onClose, walletAddress, onBetPlaced }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);

  // Use persistence hook — falls back to marketId=0 when no market selected
  const {
    outcomeIndex: selectedOutcome,
    amount,
    slippageTolerance,
    setOutcomeIndex: setSelectedOutcome,
    setAmount,
    setSlippageTolerance,
    clearForm,
  } = useFormPersistence(market?.id ?? 0);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Reset drag when drawer opens/closes
  useEffect(() => {
    if (!open) setDragY(0);
    
    // Track begin_checkout event when bet modal opens
    if (open && market) {
      trackEvent('begin_checkout', {
        market_id: market.id,
        market_question: market.question.substring(0, 50), // Truncate for privacy
        total_pool: parseFloat(market.total_pool),
        outcomes_count: market.outcomes.length,
        market_resolved: market.resolved,
      });
    }
  }, [open, market?.id]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only allow downward drag
    if (delta > 0) setDragY(delta);
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    setIsDragging(false);
    const drawerHeight = drawerRef.current?.offsetHeight ?? 400;
    const threshold = drawerHeight * CLOSE_THRESHOLD_RATIO;
    if (dragY > threshold) {
      onClose();
    } else {
      setDragY(0);
    }
  }

  async function placeBet() {
    if (selectedOutcome === null || !amount || !walletAddress || !market) return;
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
      
      // Track successful bet placement
      trackEvent('bet_placed', {
        market_id: market.id,
        outcome_index: selectedOutcome,
        amount: parseFloat(amount),
        outcome_name: market.outcomes[selectedOutcome],
      });

      // Clear persisted form state after successful submission
      clearForm();
      onBetPlaced?.();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
      
      // Track bet placement error
      trackEvent('bet_error', {
        market_id: market?.id,
        error_message: err.message.substring(0, 100), // Truncate for privacy
        amount: parseFloat(amount) || 0,
      });
    } finally {
      setLoading(false);
    }
  }

  if (!open && dragY === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="trade-drawer-backdrop"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        data-testid="trade-drawer"
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl max-h-[80vh] flex flex-col"
        data-safe-area="bottom"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Drag handle */}
        <div
          data-testid="trade-drawer-handle"
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-8 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {market ? (
            <>
              <h3 className="text-white font-semibold text-lg leading-snug mb-4">
                {market.question}
              </h3>

              <p className="text-gray-400 text-sm mb-4">
                Pool:{" "}
                <span className="text-white font-medium">
                  {parseFloat(market.total_pool).toFixed(2)} XLM
                </span>
              </p>

              {/* Outcome buttons */}
              <div className="flex gap-3 mb-5">
                {market.outcomes.map((outcome, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedOutcome(i)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors
                      ${selectedOutcome === i
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                  >
                    {outcome}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              {walletAddress ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-3">
                    <input
                      type="number"
                      placeholder="Amount (XLM)"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500"
                    />
                    <button
                      onClick={placeBet}
                      disabled={loading || selectedOutcome === null || !amount}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-xl text-sm font-bold"
                    >
                      {loading ? "..." : "Bet"}
                    </button>
                  </div>

                  {/* Slippage + clear row */}
                  <div className="flex items-center justify-between">
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
              ) : (
                <p className="text-gray-400 text-sm text-center py-2">
                  Connect your wallet to place a bet
                </p>
              )}

              {message && (
                <p className={`text-sm mt-3 ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {message}
                </p>
              )}

              {/* What-If Simulator — shown when an outcome is selected */}
              {selectedOutcome !== null && (
                <WhatIfSimulator
                  poolForOutcome={parseFloat(market.total_pool) / market.outcomes.length}
                  totalPool={parseFloat(market.total_pool)}
                />
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No market selected</p>
          )}
        </div>
      </div>
    </>
  );
}
