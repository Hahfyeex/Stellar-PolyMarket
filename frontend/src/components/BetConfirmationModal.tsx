"use client";

import { useMemo } from "react";
import type { Market } from "../types/market";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
  market: Market;
  outcomeIndex: number;
  amount: number;
  odds: number; // probability (0-1)
}

export default function BetConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  error,
  market,
  outcomeIndex,
  amount,
  odds,
}: Props) {
  const feePercent = 2; // Standard platform fee
  const feeAmount = (amount * feePercent) / 100;
  const netStake = amount - feeAmount;
  const potentialPayout = netStake / odds;
  const oddsPercentage = (odds * 100).toFixed(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <h3 className="text-xl font-bold text-white">Confirm Your Bet</h3>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400"
            >
              ✕
            </button>
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Market</p>
              <p className="text-sm font-medium text-white line-clamp-2">{market.question}</p>
            </div>
            
            <div className="flex justify-between items-center py-2 border-t border-slate-800/50">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Outcome</p>
                <p className={`text-base font-bold ${outcomeIndex === 0 ? "text-green-400" : "text-red-400"}`}>
                  {market.outcomes[outcomeIndex]}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Odds</p>
                <p className="text-base font-bold text-white">{oddsPercentage}%</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Your Stake</span>
                <span className="text-white font-semibold">{amount.toFixed(2)} XLM</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Platform Fee ({feePercent}%)</span>
                <span className="text-slate-500">-{feeAmount.toFixed(2)} XLM</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-800/30">
                <span className="text-white font-bold">Potential Payout</span>
                <span className="text-green-400 font-bold">{potentialPayout.toFixed(2)} XLM</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl">
              <p className="text-xs text-red-400 flex items-center gap-2">
                <span>⚠️</span> {error}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                "Confirm Bet"
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
