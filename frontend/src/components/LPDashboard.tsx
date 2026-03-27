"use client";

import { useState } from "react";
import { LPPositionsView } from "./lp/LPPositionsView";
import { LPDepositModal } from "./lp/LPDepositModal";
import { LPWithdrawModal } from "./lp/LPWithdrawModal";
import { LPMetricsOverview } from "./lp/LPMetricsOverview";
import { LPEarningsChart } from "./lp/LPEarningsChart";

interface LPPool {
  id: string;
  name: string;
  pair: string;
  tvl: number;
  apy: number;
  volume24h: number;
  fees24h: number;
  riskLevel: "low" | "medium" | "high";
  userLiquidity?: number;
  userShare?: number;
  feesEarned?: number;
}

interface Props {
  walletAddress: string | null;
}

export default function LPDashboard({ walletAddress }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "positions" | "analytics">("overview");
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<LPPool | null>(null);

  // Mock data - replace with actual API calls
  const pools: LPPool[] = [
    {
      id: "1",
      name: "BTC/USDC Market Pool",
      pair: "XLM/USDC",
      tvl: 1250000,
      apy: 24.5,
      volume24h: 85000,
      fees24h: 255,
      riskLevel: "low",
      userLiquidity: 5000,
      userShare: 0.4,
      feesEarned: 125.50,
    },
    {
      id: "2",
      name: "ETH Price Pool",
      pair: "XLM/USDC",
      tvl: 850000,
      apy: 32.8,
      volume24h: 120000,
      fees24h: 360,
      riskLevel: "medium",
      userLiquidity: 3000,
      userShare: 0.35,
      feesEarned: 89.25,
    },
    {
      id: "3",
      name: "Sports Outcome Pool",
      pair: "XLM/USDC",
      tvl: 450000,
      apy: 45.2,
      volume24h: 65000,
      fees24h: 195,
      riskLevel: "high",
    },
  ];

  const totalMetrics = {
    totalLiquidity: pools.reduce((sum, p) => sum + (p.userLiquidity || 0), 0),
    totalFeesEarned: pools.reduce((sum, p) => sum + (p.feesEarned || 0), 0),
    averageAPY: pools.reduce((sum, p) => sum + p.apy, 0) / pools.length,
    activePositions: pools.filter(p => p.userLiquidity).length,
  };

  const handleDeposit = (pool: LPPool) => {
    setSelectedPool(pool);
    setShowDepositModal(true);
  };

  const handleWithdraw = (pool: LPPool) => {
    setSelectedPool(pool);
    setShowWithdrawModal(true);
  };

  if (!walletAddress) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-gray-900 rounded-2xl p-12 text-center border border-gray-800">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Connect your Stellar wallet to start providing liquidity and earning fees from prediction markets
          </p>
          <button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-lg font-semibold transition-all">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Liquidity Provider Dashboard</h1>
        <p className="text-gray-400">
          Provide liquidity to prediction markets and earn fees on every trade
        </p>
      </div>

      {/* Metrics Overview */}
      <LPMetricsOverview metrics={totalMetrics} />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeTab === "overview"
              ? "text-blue-400"
              : "text-gray-400 hover:text-gray-300"
          }`}
        >
          Available Pools
          {activeTab === "overview" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("positions")}
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeTab === "positions"
              ? "text-blue-400"
              : "text-gray-400 hover:text-gray-300"
          }`}
        >
          My Positions
          {totalMetrics.activePositions > 0 && (
            <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
              {totalMetrics.activePositions}
            </span>
          )}
          {activeTab === "positions" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeTab === "analytics"
              ? "text-blue-400"
              : "text-gray-400 hover:text-gray-300"
          }`}
        >
          Analytics
          {activeTab === "analytics" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              onDeposit={handleDeposit}
              onWithdraw={handleWithdraw}
            />
          ))}
        </div>
      )}

      {activeTab === "positions" && (
        <LPPositionsView
          pools={pools.filter(p => p.userLiquidity)}
          onWithdraw={handleWithdraw}
        />
      )}

      {activeTab === "analytics" && (
        <LPEarningsChart pools={pools.filter(p => p.userLiquidity)} />
      )}

      {/* Modals */}
      {showDepositModal && selectedPool && (
        <LPDepositModal
          pool={selectedPool}
          onClose={() => setShowDepositModal(false)}
          walletAddress={walletAddress}
        />
      )}

      {showWithdrawModal && selectedPool && (
        <LPWithdrawModal
          pool={selectedPool}
          onClose={() => setShowWithdrawModal(false)}
          walletAddress={walletAddress}
        />
      )}
    </div>
  );
}

// Pool Card Component
function PoolCard({
  pool,
  onDeposit,
  onWithdraw,
}: {
  pool: LPPool;
  onDeposit: (pool: LPPool) => void;
  onWithdraw: (pool: LPPool) => void;
}) {
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
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-white">{pool.name}</h3>
            <span
              className={`text-xs px-3 py-1 rounded-full border font-medium uppercase ${getRiskColor(
                pool.riskLevel
              )}`}
            >
              {pool.riskLevel} Risk
            </span>
          </div>
          <p className="text-gray-400 text-sm">{pool.pair} Liquidity Pool</p>
        </div>

        {/* APY Badge */}
        <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg px-4 py-2 text-center">
          <div className="text-2xl font-bold text-white">{pool.apy}%</div>
          <div className="text-xs text-blue-100">Current APY</div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">Total Value Locked</div>
          <div className="text-white font-semibold">
            ${(pool.tvl / 1000).toFixed(0)}K
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">24h Volume</div>
          <div className="text-white font-semibold">
            ${(pool.volume24h / 1000).toFixed(0)}K
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">24h Fees</div>
          <div className="text-green-400 font-semibold">${pool.fees24h}</div>
        </div>
      </div>

      {/* User Position (if exists) */}
      {pool.userLiquidity && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-300 text-sm font-medium">Your Position</span>
            <span className="text-blue-400 text-xs">{pool.userShare}% of pool</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-lg">
                ${pool.userLiquidity.toLocaleString()}
              </div>
              <div className="text-gray-400 text-xs">Liquidity Provided</div>
            </div>
            <div className="text-right">
              <div className="text-green-400 font-semibold text-lg">
                +${pool.feesEarned?.toFixed(2)}
              </div>
              <div className="text-gray-400 text-xs">Fees Earned</div>
            </div>
          </div>
        </div>
      )}

      {/* Stellar Low Fee Tooltip */}
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <div className="text-purple-300 text-sm font-medium mb-1">
              ⚡ Stellar Low Fee Advantage
            </div>
            <div className="text-gray-400 text-xs">
              Rebalancing costs ~$0.00001 on Stellar vs $5-50 on Ethereum. More frequent rebalancing = better returns.
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onDeposit(pool)}
          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/50"
        >
          Deposit XLM/USDC
        </button>
        {pool.userLiquidity && (
          <button
            onClick={() => onWithdraw(pool)}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-semibold transition-colors border border-gray-700"
          >
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}
