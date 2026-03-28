"use client";
/**
 * GasSavingsWidget
 *
 * Dashboard widget that shows how much the user saved by using Stella
 * (Soroban / Stellar) instead of Ethereum for their transactions.
 *
 * Displays: "$142.50 Saved this month" style callout with a breakdown
 * of the ETH cost vs Stellar cost.
 */
import React from "react";
import { useGasSavings } from "../hooks/useGasSavings";

interface Props {
  /** Number of transactions to multiply the per-tx savings by. Defaults to 1. */
  txCount?: number;
  className?: string;
}

function fmt(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function GasSavingsWidget({ txCount = 1, className = "" }: Props) {
  const { savedUsd, ethCostUsd, stellarCostUsd, ethGasGwei, loading, error } =
    useGasSavings();

  const totalSaved = savedUsd * txCount;
  const totalEth = ethCostUsd * txCount;
  const totalStellar = stellarCostUsd * txCount;

  return (
    <div
      data-testid="gas-savings-widget"
      className={`rounded-2xl border border-gray-700 bg-gray-900 p-5 space-y-4 ${className}`}
      role="region"
      aria-label="Gas savings comparison"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Stellar Advantage
        </h2>
        <span className="text-[10px] text-gray-600">
          {loading ? "Updating…" : `${ethGasGwei} gwei`}
        </span>
      </div>

      {/* Main savings callout */}
      {loading ? (
        <div
          data-testid="savings-loading"
          className="h-10 w-40 rounded-lg bg-gray-800 animate-pulse"
          aria-label="Loading savings data"
        />
      ) : error ? (
        <p data-testid="savings-error" className="text-red-400 text-sm">
          {error}
        </p>
      ) : (
        <div data-testid="savings-amount">
          <p className="text-3xl font-bold text-green-400 tabular-nums">
            {fmt(totalSaved)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Saved vs Ethereum{txCount > 1 ? ` across ${txCount} txs` : " per transaction"}
          </p>
        </div>
      )}

      {/* Breakdown */}
      {!loading && !error && (
        <div
          data-testid="savings-breakdown"
          className="space-y-2 border-t border-gray-800 pt-3"
        >
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Ethereum would cost</span>
            <span
              data-testid="eth-cost"
              className="text-red-400 tabular-nums font-medium"
            >
              {fmt(totalEth)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Stellar actually costs</span>
            <span
              data-testid="stellar-cost"
              className="text-blue-400 tabular-nums font-medium"
            >
              {fmt(totalStellar)}
            </span>
          </div>
          <div className="flex justify-between text-xs border-t border-gray-800 pt-2">
            <span className="text-gray-400">You saved</span>
            <span
              data-testid="you-saved"
              className="text-green-400 tabular-nums font-semibold"
            >
              {fmt(totalSaved)}
            </span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-600 leading-tight">
        ETH gas via Etherscan Gas Oracle · XLM price via CoinGecko · refreshes every 60s
      </p>
    </div>
  );
}
