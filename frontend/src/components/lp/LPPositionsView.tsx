"use client";

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
  pools: LPPool[];
  onWithdraw: (pool: LPPool) => void;
}

export function LPPositionsView({ pools, onWithdraw }: Props) {
  if (pools.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-12 text-center border border-gray-800">
        <div className="w-20 h-20 bg-gray-800 rounded-full mx-auto mb-6 flex items-center justify-center">
          <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Active Positions</h3>
        <p className="text-gray-400 mb-6">
          You haven't provided liquidity to any pools yet. Start earning fees by depositing into a pool.
        </p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
          Browse Available Pools
        </button>
      </div>
    );
  }

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

  const totalValue = pools.reduce((sum, p) => sum + (p.userLiquidity || 0), 0);
  const totalFees = pools.reduce((sum, p) => sum + (p.feesEarned || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-6 border border-blue-800/50">
        <h3 className="text-lg font-semibold text-white mb-4">Portfolio Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-gray-400 text-sm mb-1">Total Value</div>
            <div className="text-2xl font-bold text-white">
              ${totalValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-sm mb-1">Total Fees Earned</div>
            <div className="text-2xl font-bold text-green-400">
              +${totalFees.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-sm mb-1">Active Pools</div>
            <div className="text-2xl font-bold text-white">{pools.length}</div>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="space-y-4">
        {pools.map((pool) => (
          <div
            key={pool.id}
            className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-gray-700 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-lg font-semibold text-white">{pool.name}</h4>
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
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{pool.apy}%</div>
                <div className="text-xs text-gray-400">APY</div>
              </div>
            </div>

            {/* Position Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Your Liquidity</div>
                <div className="text-white font-semibold text-lg">
                  ${pool.userLiquidity?.toLocaleString()}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Pool Share</div>
                <div className="text-blue-400 font-semibold text-lg">
                  {pool.userShare}%
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Fees Earned</div>
                <div className="text-green-400 font-semibold text-lg">
                  +${pool.feesEarned?.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">24h Fees</div>
                <div className="text-white font-semibold text-lg">
                  ${pool.fees24h}
                </div>
              </div>
            </div>

            {/* Impermanent Loss Warning */}
            {pool.riskLevel !== "low" && (
              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="text-yellow-300 text-sm font-medium mb-1">
                      Impermanent Loss Warning
                    </div>
                    <div className="text-gray-400 text-xs">
                      {pool.riskLevel === "high"
                        ? "High volatility market. Potential for significant impermanent loss if prices diverge."
                        : "Moderate volatility. Monitor price movements to minimize impermanent loss."}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg font-medium transition-colors border border-gray-700">
                Add Liquidity
              </button>
              <button
                onClick={() => onWithdraw(pool)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg font-medium transition-colors border border-gray-700"
              >
                Withdraw
              </button>
              <button className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg transition-colors border border-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
