"use client";

import { useState } from "react";

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
}

export function LPEarningsChart({ pools }: Props) {
  const [timeframe, setTimeframe] = useState<"7d" | "30d" | "90d" | "1y">("30d");

  // Mock earnings data - replace with actual API data
  const generateEarningsData = () => {
    const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 365;
    const data = [];
    let cumulative = 0;

    for (let i = 0; i < days; i++) {
      const dailyEarnings = Math.random() * 5 + 2; // $2-7 per day
      cumulative += dailyEarnings;
      data.push({
        day: i + 1,
        earnings: dailyEarnings,
        cumulative: cumulative,
      });
    }
    return data;
  };

  const earningsData = generateEarningsData();
  const maxCumulative = Math.max(...earningsData.map(d => d.cumulative));
  const totalEarnings = earningsData[earningsData.length - 1]?.cumulative || 0;

  return (
    <div className="space-y-6">
      {/* Important Notice - Visual Separation */}
      <div className="bg-gradient-to-r from-purple-900/30 via-blue-900/30 to-green-900/30 border-2 border-purple-700/50 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              📊 Earnings vs Betting: Understanding the Difference
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <p>
                <span className="text-green-400 font-semibold">✓ Liquidity Provider Earnings</span> (This Chart): 
                Passive income from trading fees. You earn regardless of market outcomes. Lower risk, steady returns.
              </p>
              <p>
                <span className="text-blue-400 font-semibold">✓ Betting/Trading</span> (Market Charts): 
                Active speculation on outcomes. Win or lose based on predictions. Higher risk, higher potential returns.
              </p>
              <p className="text-purple-300 font-medium">
                💡 Pro Tip: Diversify by both providing liquidity (steady income) AND betting (upside potential)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Card */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-1">Earnings Analytics</h3>
            <p className="text-gray-400 text-sm">Track your liquidity provider fee earnings over time</p>
          </div>

          {/* Timeframe Selector */}
          <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
            {(["7d", "30d", "90d", "1y"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeframe === tf
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-300"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Total Earned</div>
            <div className="text-2xl font-bold text-green-400">
              ${totalEarnings.toFixed(2)}
            </div>
            <div className="text-gray-500 text-xs mt-1">
              Last {timeframe === "7d" ? "7 days" : timeframe === "30d" ? "30 days" : timeframe === "90d" ? "90 days" : "year"}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Daily Average</div>
            <div className="text-2xl font-bold text-white">
              ${(totalEarnings / earningsData.length).toFixed(2)}
            </div>
            <div className="text-green-400 text-xs mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
              </svg>
              <span>+12.5% vs last period</span>
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Projected Annual</div>
            <div className="text-2xl font-bold text-purple-400">
              ${((totalEarnings / earningsData.length) * 365).toFixed(0)}
            </div>
            <div className="text-gray-500 text-xs mt-1">Based on current rate</div>
          </div>
        </div>

        {/* Chart */}
        <div className="relative h-64 bg-gray-800/30 rounded-lg p-4">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500 py-4">
            <span>${maxCumulative.toFixed(0)}</span>
            <span>${(maxCumulative * 0.75).toFixed(0)}</span>
            <span>${(maxCumulative * 0.5).toFixed(0)}</span>
            <span>${(maxCumulative * 0.25).toFixed(0)}</span>
            <span>$0</span>
          </div>

          {/* Chart area */}
          <div className="ml-12 h-full relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-t border-gray-700/50" />
              ))}
            </div>

            {/* Line chart */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="earningsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area fill */}
              <path
                d={`M 0 ${256} ${earningsData
                  .map(
                    (d, i) =>
                      `L ${(i / (earningsData.length - 1)) * 100}% ${
                        256 - (d.cumulative / maxCumulative) * 256
                      }`
                  )
                  .join(" ")} L 100% 256 Z`}
                fill="url(#earningsGradient)"
              />

              {/* Line */}
              <polyline
                points={earningsData
                  .map(
                    (d, i) =>
                      `${(i / (earningsData.length - 1)) * 100}%,${
                        256 - (d.cumulative / maxCumulative) * 256
                      }`
                  )
                  .join(" ")}
                fill="none"
                stroke="rgb(34, 197, 94)"
                strokeWidth="2"
              />
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="absolute bottom-0 left-12 right-0 flex justify-between text-xs text-gray-500 mt-2">
            <span>Start</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>Now</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-400 rounded-full" />
            <span className="text-gray-400">Cumulative Earnings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-400 rounded-full" />
            <span className="text-gray-400">Daily Fees</span>
          </div>
        </div>
      </div>

      {/* Pool Breakdown */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">Earnings by Pool</h3>
        <div className="space-y-3">
          {pools.map((pool) => (
            <div key={pool.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  {pool.name.substring(0, 2)}
                </div>
                <div>
                  <div className="text-white font-medium">{pool.name}</div>
                  <div className="text-gray-400 text-sm">{pool.apy}% APY</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-green-400 font-semibold">
                  +${pool.feesEarned?.toFixed(2)}
                </div>
                <div className="text-gray-500 text-sm">
                  {((pool.feesEarned || 0) / totalEarnings * 100).toFixed(1)}% of total
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
