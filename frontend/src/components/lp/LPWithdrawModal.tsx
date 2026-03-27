"use client";

import { useState } from "react";

interface LPPool {
  id: string;
  name: string;
  pair: string;
  tvl: number;
  apy: number;
  riskLevel: "low" | "medium" | "high";
  userLiquidity?: number;
  feesEarned?: number;
}

interface Props {
  pool: LPPool;
  onClose: () => void;
  walletAddress: string;
}

export function LPWithdrawModal({ pool, onClose, walletAddress }: Props) {
  const [percentage, setPercentage] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const withdrawAmount = ((pool.userLiquidity || 0) * percentage) / 100;
  const xlmAmount = withdrawAmount / 2;
  const usdcAmount = withdrawAmount / 2;
  const feesToClaim = ((pool.feesEarned || 0) * percentage) / 100;

  const handleWithdraw = async () => {
    if (percentage <= 0) {
      setError("Please select an amount to withdraw");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Success - close modal
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to withdraw liquidity");
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "text-green-400 bg-green-900/30 border-green-700";
      case "medium":
        return "text-yellow-400 bg-yellow-900/30 border-yellow-700";
      case "high":
        return "text-red-400 bg-red-900/30 border-red-700";
      default:
        return "text-gray-400 bg-gray-900/30 border-gray-700";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">Withdraw Liquidity</h2>
            <p className="text-gray-400 text-sm mt-1">{pool.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Position Info */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-sm">Your Position</span>
              <span
                className={`text-xs px-3 py-1 rounded-full border font-medium uppercase ${getRiskColor(
                  pool.riskLevel
                )}`}
              >
                {pool.riskLevel} Risk
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-gray-400 text-xs mb-1">Total Liquidity</div>
                <div className="text-white font-semibold text-lg">
                  ${pool.userLiquidity?.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Fees Earned</div>
                <div className="text-green-400 font-semibold text-lg">
                  +${pool.feesEarned?.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Percentage Selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-medium">Withdrawal Amount</label>
              <span className="text-blue-400 font-bold text-lg">{percentage}%</span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="0"
              max="100"
              value={percentage}
              onChange={(e) => setPercentage(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />

            {/* Quick Select Buttons */}
            <div className="flex gap-2 mt-3">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercentage(pct)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    percentage === pct
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Withdrawal Breakdown */}
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
            <div className="text-white font-medium mb-2">You will receive:</div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  XLM
                </div>
                <span className="text-gray-400">Stellar Lumens</span>
              </div>
              <span className="text-white font-semibold">{xlmAmount.toFixed(2)} XLM</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  USDC
                </div>
                <span className="text-gray-400">USD Coin</span>
              </div>
              <span className="text-white font-semibold">{usdcAmount.toFixed(2)} USDC</span>
            </div>

            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Unclaimed Fees</span>
                <span className="text-green-400 font-semibold">+${feesToClaim.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Total Value</span>
                <span className="text-white font-bold text-lg">
                  ${(withdrawAmount + feesToClaim).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Impermanent Loss Warning */}
          {pool.riskLevel !== "low" && percentage === 100 && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="text-yellow-300 text-sm font-medium mb-1">
                    Impermanent Loss Notice
                  </div>
                  <div className="text-gray-400 text-xs">
                    You may receive different token ratios than deposited due to price changes. This is normal for AMM liquidity pools.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stellar Low Fee Notice */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <div className="text-xs text-gray-400">
                <span className="text-purple-300 font-medium">Low withdrawal fee:</span> ~$0.00001 on Stellar
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-semibold transition-colors border border-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleWithdraw}
              disabled={loading || percentage <= 0}
              className="flex-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-all shadow-lg shadow-red-900/50"
            >
              {loading ? "Withdrawing..." : "Withdraw"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
