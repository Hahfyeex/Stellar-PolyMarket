"use client";

import { useState } from "react";
import { useBatchTransaction } from "../../hooks/useBatchTransaction";
import { Operation, Asset } from "@stellar/stellar-sdk";

interface LPPool {
  id: string;
  name: string;
  pair: string;
  tvl: number;
  apy: number;
  riskLevel: "low" | "medium" | "high";
}

interface Props {
  pool: LPPool;
  onClose: () => void;
  walletAddress: string;
}

export function LPDepositModal({ pool, onClose, walletAddress }: Props) {
  const [xlmAmount, setXlmAmount] = useState("");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [error, setError] = useState("");

  /**
   * useBatchTransaction bundles the XLM deposit + USDC trustline setup into
   * a single Freighter approval — one pop-up instead of two.
   * Batch flow: [placeBet (XLM deposit), addTrustline (USDC)]
   */
  const { submitting: loading, error: batchError, submitOperations } = useBatchTransaction(onClose);

  // Mock balances - replace with actual wallet balances
  const xlmBalance = 10000;
  const usdcBalance = 5000;

  const handleXlmChange = (value: string) => {
    setXlmAmount(value);
    // Auto-calculate USDC amount (1:1 ratio for simplicity)
    if (value) {
      setUsdcAmount(value);
    } else {
      setUsdcAmount("");
    }
  };

  const handleDeposit = async () => {
    if (!xlmAmount || !usdcAmount) {
      setError("Please enter amounts for both tokens");
      return;
    }
    if (parseFloat(xlmAmount) > xlmBalance) {
      setError("Insufficient XLM balance");
      return;
    }
    if (parseFloat(usdcAmount) > usdcBalance) {
      setError("Insufficient USDC balance");
      return;
    }

    setError("");

    /**
     * Batch: [XLM deposit payment, USDC trustline setup]
     * Both operations are submitted atomically — one Freighter pop-up.
     * If either fails, the entire transaction rolls back with no partial state.
     */
    await submitOperations(
      [
        {
          type: "placeBet", // XLM deposit into the LP pool
          operation: Operation.payment({
            destination: walletAddress,
            asset: Asset.native(),
            amount: parseFloat(xlmAmount).toFixed(7),
          }),
        },
        {
          type: "addTrustline", // Establish USDC trustline in the same transaction
          operation: Operation.changeTrust({
            asset: new Asset("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"),
          }),
        },
      ],
      walletAddress
    );
  };

  const estimatedShare = xlmAmount ? ((parseFloat(xlmAmount) * 2) / pool.tvl * 100).toFixed(4) : "0";
  const estimatedDailyEarnings = xlmAmount ? ((parseFloat(xlmAmount) * 2 * pool.apy / 100) / 365).toFixed(2) : "0";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">Deposit Liquidity</h2>
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
          {/* Pool Info */}
          <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-800/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Current APY</span>
              <span className="text-2xl font-bold text-white">{pool.apy}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total Value Locked</span>
              <span className="text-white font-medium">${(pool.tvl / 1000).toFixed(0)}K</span>
            </div>
          </div>

          {/* XLM Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white font-medium">XLM Amount</label>
              <span className="text-gray-400 text-sm">
                Balance: {xlmBalance.toLocaleString()} XLM
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={xlmAmount}
                onChange={(e) => handleXlmChange(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 pr-20 outline-none border border-gray-700 focus:border-blue-500 transition-colors"
              />
              <button
                onClick={() => handleXlmChange(xlmBalance.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Plus Icon */}
          <div className="flex justify-center">
            <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </div>

          {/* USDC Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white font-medium">USDC Amount</label>
              <span className="text-gray-400 text-sm">
                Balance: {usdcBalance.toLocaleString()} USDC
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 pr-20 outline-none border border-gray-700 focus:border-blue-500 transition-colors"
              />
              <button
                onClick={() => setUsdcAmount(usdcBalance.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Estimates */}
          {xlmAmount && (
            <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Estimated Pool Share</span>
                <span className="text-white font-medium">{estimatedShare}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Estimated Daily Earnings</span>
                <span className="text-green-400 font-medium">~${estimatedDailyEarnings}/day</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Estimated Annual Earnings</span>
                <span className="text-green-400 font-medium">~${(parseFloat(estimatedDailyEarnings) * 365).toFixed(2)}/year</span>
              </div>
            </div>
          )}

          {/* Stellar Low Fee Notice */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="text-purple-300 text-sm font-medium mb-1">
                  ⚡ Stellar Low Fee Advantage
                </div>
                <div className="text-gray-400 text-xs">
                  Transaction fee: ~$0.00001 (vs $5-50 on Ethereum). More of your earnings stay with you!
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {(error || batchError) && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-red-400 text-sm">
              {error || batchError}
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
              onClick={handleDeposit}
              disabled={loading || !xlmAmount || !usdcAmount}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/50"
            >
              {loading ? "Depositing..." : "Deposit XLM/USDC"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
