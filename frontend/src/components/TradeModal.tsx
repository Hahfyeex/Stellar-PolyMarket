"use client";
/**
 * TradeModal — Issue #102 reference
 *
 * Sidebar trade panel for the Market Detail page.
 * Handles outcome selection, amount input, slippage, and bet submission.
 * Reuses existing hooks (useFormPersistence, useTrustline, useBettingSlip).
 */
import { useState } from "react";
import { useBettingSlip } from "../context/BettingSlipContext";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { useTrustline } from "../hooks/useTrustline";
import { buildBetRequestBody, finalizeReferralAttribution } from "../lib/referral";
import TrustlineModal from "./TrustlineModal";
import WhatIfSimulator from "./WhatIfSimulator";
import Toast from "./Toast";

interface Market {
  id: number;
  question: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  end_date: string;
  asset?: { code: string; issuer: string };
}

interface Props {
  market: Market;
  walletAddress: string | null;
  onBetPlaced?: () => void;
  onConnectWallet?: () => void;
}

export default function TradeModal({ market, walletAddress, onBetPlaced, onConnectWallet }: Props) {
  const {
    outcomeIndex: selectedOutcome,
    amount,
    slippageTolerance,
    setOutcomeIndex,
    setAmount,
    setSlippageTolerance,
    clearForm,
  } = useFormPersistence(market.id);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showQueueFullToast, setShowQueueFullToast] = useState(false);
  const { addBet } = useBettingSlip();
  const {
    state: trustlineState,
    pendingAsset,
    errorMessage: trustlineError,
    checkAndRun,
    confirmTrustline,
    dismiss: dismissTrustline,
    retry: retryTrustline,
  } = useTrustline();

  const isExpired = new Date(market.end_date) <= new Date();
  const isDisabled = market.resolved || isExpired;

  async function placeBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;
    if (market.asset) {
      await checkAndRun(market.asset, walletAddress, submitBet);
    } else {
      await submitBet();
    }
  }

  async function submitBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;
    const xlm = parseFloat(amount);
    if (!isFinite(xlm) || xlm <= 0) {
      setMessage("Error: Enter a valid positive amount");
      return;
    }
    const stroops = Math.round(xlm * 1e7);
    if (!Number.isInteger(stroops) || stroops <= 0) {
      setMessage("Error: Amount too small");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const requestBody = buildBetRequestBody({
        marketId: market.id,
        outcomeIndex: selectedOutcome,
        amount: stroops.toString(),
        walletAddress,
      });
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      finalizeReferralAttribution(walletAddress);
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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4 sticky top-4">
      <TrustlineModal
        state={trustlineState}
        asset={pendingAsset}
        errorMessage={trustlineError}
        onConfirm={confirmTrustline}
        onDismiss={dismissTrustline}
        onRetry={retryTrustline}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-base">Trade</h3>
        {isDisabled && (
          <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded-full">
            {market.resolved ? "Resolved" : "Ended"}
          </span>
        )}
      </div>

      {/* Outcome buttons */}
      <div className="space-y-2">
        <p className="text-gray-400 text-xs uppercase tracking-wide">Pick outcome</p>
        <div className="flex flex-col gap-2">
          {market.outcomes.map((outcome, i) => {
            const prob = (100 / market.outcomes.length).toFixed(0);
            const isWinner = market.resolved && market.winning_outcome === i;
            return (
              <button
                key={i}
                onClick={() => !isDisabled && setOutcomeIndex(i)}
                disabled={isDisabled}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                  isWinner
                    ? "bg-green-900/40 border-green-600 text-green-300"
                    : selectedOutcome === i
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{outcome}</span>
                <span
                  className={`text-xs font-bold ${isWinner ? "text-green-400" : "text-gray-400"}`}
                >
                  {prob}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount input */}
      {!isDisabled && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-gray-400 text-xs uppercase tracking-wide">Amount (XLM)</label>
            <input
              type="number"
              placeholder="e.g. 100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500 transition-colors"
            />
            {/* Quick-fill buttons */}
            <div className="flex gap-2 mt-1">
              {[100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white py-1.5 rounded-lg transition-colors border border-gray-700"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Slippage */}
          <label className="flex items-center justify-between text-xs text-gray-400">
            <span>Slippage tolerance</span>
            <select
              value={slippageTolerance}
              onChange={(e) => setSlippageTolerance(parseFloat(e.target.value))}
              className="bg-gray-800 text-white rounded-lg px-2 py-1 text-xs border border-gray-700 outline-none"
            >
              <option value={0.1}>0.1%</option>
              <option value={0.5}>0.5%</option>
              <option value={1}>1%</option>
              <option value={2}>2%</option>
            </select>
          </label>

          {/* Action buttons */}
          {walletAddress ? (
            <div className="flex gap-2">
              <button
                onClick={placeBet}
                disabled={loading || selectedOutcome === null || !amount}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl text-sm font-bold transition-colors"
              >
                {loading ? "Placing..." : "Place Bet"}
              </button>
              <button
                title="Add to betting slip"
                onClick={() => {
                  if (selectedOutcome === null || !amount) return;
                  const xlm = parseFloat(amount);
                  if (!isFinite(xlm) || xlm <= 0) return;
                  addBet(
                    {
                      marketId: market.id,
                      marketTitle: market.question,
                      outcomeIndex: selectedOutcome,
                      outcomeName: market.outcomes[selectedOutcome],
                      amount: Math.round(xlm * 1e7),
                    },
                    () => setShowQueueFullToast(true)
                  );
                }}
                disabled={selectedOutcome === null || !amount}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                + Slip
              </button>
            </div>
          ) : (
            <button
              onClick={onConnectWallet}
              className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors"
            >
              Connect Wallet to Trade
            </button>
          )}

          {message && (
            <p
              className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}
            >
              {message}
            </p>
          )}
        </div>
      )}

      {/* What-If Simulator */}
      {!isDisabled && selectedOutcome !== null && (
        <WhatIfSimulator
          poolForOutcome={parseFloat(market.total_pool) / market.outcomes.length}
          totalPool={parseFloat(market.total_pool)}
        />
      )}

      {showQueueFullToast && (
        <Toast
          message="Betting slip is full (max 5 bets). Remove one to add more."
          type="warning"
          onDismiss={() => setShowQueueFullToast(false)}
        />
      )}
    </div>
  );
}
