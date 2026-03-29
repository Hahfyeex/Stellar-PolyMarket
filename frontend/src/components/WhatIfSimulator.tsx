"use client";
import { useState, useEffect, useRef } from "react";
// Named imports — webpack tree-shakes unused recharts components via the
// package's sideEffects:false declaration, keeping the bundle lean.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useChartTheme } from "./ChartThemeProvider";
import { calculateSimulator } from "../utils/simulatorCalc";

interface Props {
  /** Current pool size for the selected outcome (XLM) */
  poolForOutcome: number;
  /** Total pool across all outcomes (XLM) */
  totalPool: number;
  /** Max stake for the slider (defaults to 2× totalPool or 1000) */
  maxStake?: number;
}

const DEBOUNCE_MS = 200;

export default function WhatIfSimulator({ poolForOutcome, totalPool, maxStake }: Props) {
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState(10);
  const [result, setResult] = useState(() => calculateSimulator(10, poolForOutcome, totalPool));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sliderMax = maxStake ?? Math.max(totalPool * 2, 1000);

  const colors = useChartTheme();

  // Recalculate with debounce on every stake or pool change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResult(calculateSimulator(stake, poolForOutcome, totalPool));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [stake, poolForOutcome, totalPool]);

  const chartData = [
    { name: "Stake", value: stake, fill: "#6366f1" },
    { name: "Projected Win", value: result.projectedPayout, fill: "#22c55e" },
  ];

  const profitPositive = result.projectedProfit >= 0;

  return (
    <div
      data-testid="whatif-simulator"
      className="mt-3 rounded-xl border border-gray-700 bg-gray-850 overflow-hidden"
    >
      {/* Collapsible header — no layout shift: height is always reserved */}
      <button
        data-testid="simulator-toggle"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-white transition-colors bg-gray-800 rounded-xl"
        aria-expanded={open}
        aria-controls="simulator-body"
      >
        <span>📊 What-If Simulator</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Body — CSS height transition avoids layout shift */}
      <div
        id="simulator-body"
        data-testid="simulator-body"
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 pt-3 space-y-4">
          {/* Stake input row */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Stake amount</span>
              <span className="text-white font-medium">{stake.toFixed(2)} XLM</span>
            </div>
            <input
              data-testid="stake-slider"
              type="range"
              min={1}
              max={sliderMax}
              step={1}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-full accent-blue-500"
              aria-label="Stake amount slider"
            />
            <input
              data-testid="stake-input"
              type="number"
              min={1}
              max={sliderMax}
              step={1}
              value={stake}
              onChange={(e) => {
                const v = Math.max(1, Math.min(sliderMax, Number(e.target.value)));
                setStake(isNaN(v) ? 1 : v);
              }}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-blue-500"
              aria-label="Stake amount input"
            />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-400">Implied Prob.</p>
              <p className="text-white font-semibold mt-0.5" data-testid="implied-prob">
                {result.impliedProbability.toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-400">Projected Win</p>
              <p className="text-green-400 font-semibold mt-0.5" data-testid="projected-payout">
                {result.projectedPayout.toFixed(2)} XLM
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-400">P&amp;L</p>
              <p
                className={`font-semibold mt-0.5 ${profitPositive ? "text-green-400" : "text-red-400"}`}
                data-testid="projected-profit"
              >
                {profitPositive ? "+" : ""}
                {result.projectedProfit.toFixed(2)} XLM
              </p>
            </div>
          </div>

          {/* Bar chart */}
          <div data-testid="simulator-chart" className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#1f2937",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(v) => [`${Number(v ?? 0).toFixed(2)} XLM`] as [string]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Formula: (stake / (outcomePool + stake)) × totalPool × 0.97 · 3% fee applied
          </p>
        </div>
      </div>
    </div>
  );
}
