"use client";

interface Metrics {
  totalLiquidity: number;
  totalFeesEarned: number;
  averageAPY: number;
  activePositions: number;
}

interface Props {
  metrics: Metrics;
}

export function LPMetricsOverview({ metrics }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Total Liquidity */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="text-gray-400 text-sm mb-1">Total Liquidity Provided</div>
        <div className="text-3xl font-bold text-white mb-1">
          ${metrics.totalLiquidity.toLocaleString()}
        </div>
        <div className="text-green-400 text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
          </svg>
          <span>Active</span>
        </div>
      </div>

      {/* Total Fees Earned */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="text-gray-400 text-sm mb-1">Total Fees Earned</div>
        <div className="text-3xl font-bold text-white mb-1">
          ${metrics.totalFeesEarned.toFixed(2)}
        </div>
        <div className="text-gray-500 text-sm">All-time earnings</div>
      </div>

      {/* Average APY */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <div className="text-gray-400 text-sm mb-1">Average APY</div>
        <div className="text-3xl font-bold text-white mb-1">
          {metrics.averageAPY.toFixed(1)}%
        </div>
        <div className="text-purple-400 text-sm">Across all positions</div>
      </div>

      {/* Active Positions */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-orange-600/20 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>
        <div className="text-gray-400 text-sm mb-1">Active Positions</div>
        <div className="text-3xl font-bold text-white mb-1">
          {metrics.activePositions}
        </div>
        <div className="text-gray-500 text-sm">Liquidity pools</div>
      </div>
    </div>
  );
}
