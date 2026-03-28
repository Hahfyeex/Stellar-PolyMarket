"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import {
  PortfolioPosition,
  PortfolioRange,
  buildCumulativePnlSeries,
  filterPositionsByRange,
  summarizePortfolio,
} from "../utils/portfolio";

interface PortfolioDashboardProps {
  positions: PortfolioPosition[];
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} XLM`;
}

export default function PortfolioDashboard({ positions }: PortfolioDashboardProps) {
  const [range, setRange] = useState<PortfolioRange>("all");

  const filteredPositions = filterPositionsByRange(positions, range);
  const summary = summarizePortfolio(filteredPositions);
  const chartData = buildCumulativePnlSeries(filteredPositions);

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
              Portfolio
            </p>
            <h1 className="text-3xl font-semibold">P&amp;L dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Track active and resolved positions, cumulative returns, and how your prediction edge evolves over time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "7d" as const, label: "Last 7 days" },
              { id: "30d" as const, label: "Last 30 days" },
              { id: "all" as const, label: "All time" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  range === option.id
                    ? "border-blue-500 bg-blue-500/15 text-blue-200"
                    : "border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total staked", value: formatCurrency(summary.totalStaked), tone: "text-white" },
            { label: "Total won", value: formatCurrency(summary.totalWon), tone: "text-emerald-400" },
            { label: "Total lost", value: formatCurrency(summary.totalLost), tone: "text-rose-400" },
            {
              label: "Net P&L",
              value: formatCurrency(summary.netPnl),
              tone: summary.netPnl >= 0 ? "text-emerald-400" : "text-rose-400",
            },
          ].map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-gray-800 bg-gray-900/80 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{stat.label}</p>
              <p className={`mt-3 text-2xl font-semibold ${stat.tone}`}>{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[28px] border border-gray-800 bg-gray-900/75 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Cumulative P&amp;L</h2>
              <p className="mt-1 text-sm text-gray-400">
                One point per resolved market in the selected date range.
              </p>
            </div>
            <span data-testid="chart-point-count" className="text-xs uppercase tracking-[0.2em] text-gray-500">
              {chartData.length} points
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="portfolioPnl" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid #1f2937",
                    borderRadius: "16px",
                    color: "#e2e8f0",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="#22c55e"
                  fill="url(#portfolioPnl)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-gray-800 bg-gray-900/75">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-950/80">
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-gray-500">
                  <th className="px-4 py-4">Market</th>
                  <th className="px-4 py-4">Outcome</th>
                  <th className="px-4 py-4 text-right">Stake</th>
                  <th className="px-4 py-4 text-right">Current value</th>
                  <th className="px-4 py-4 text-right">Unrealized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((position) => {
                  const pnl = position.currentValue - position.stakeAmount;
                  const rowTone =
                    position.status === "won"
                      ? "bg-emerald-500/8"
                      : position.status === "lost"
                        ? "bg-rose-500/8"
                        : "bg-gray-900/30";

                  return (
                    <tr
                      key={position.id}
                      data-status={position.status}
                      className={`border-t border-gray-800 ${rowTone}`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-white">{position.marketTitle}</span>
                          <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                            {position.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-200">{position.outcomeLabel}</td>
                      <td className="px-4 py-4 text-right text-sm text-gray-200">
                        {formatCurrency(position.stakeAmount)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-gray-200">
                        {formatCurrency(position.currentValue)}
                      </td>
                      <td
                        className={`px-4 py-4 text-right text-sm font-medium ${
                          pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-gray-400"
                        }`}
                      >
                        {formatCurrency(pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
