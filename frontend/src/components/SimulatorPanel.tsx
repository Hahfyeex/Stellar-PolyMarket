"use client";

import React, { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface SimulatorPanelProps {
  market: {
    total_pool: string;
    outcomes: string[];
  };
  selectedOutcomeIndex?: number;
}

export default function SimulatorPanel({ market, selectedOutcomeIndex = 0 }: SimulatorPanelProps) {
  const [stake, setStake] = useState<string>("100");
  const [isOpen, setIsOpen] = useState(true);

  // BigInt arithmetic for payouts: payout = (stake / outcome_pool * total_pool * 0.97)
  // We'll use 7 decimal places (stroops)
  const calculatePayout = (stakeAmount: string) => {
    try {
      const stakeBig = BigInt(Math.floor(parseFloat(stakeAmount) * 1e7));
      const totalPoolBig = BigInt(Math.floor(parseFloat(market.total_pool) * 1e7));
      
      // Simplify: assume outcome pool is total_pool / outcomes.length for simulation 
      // if real outcome pools are not provided (they aren't in the market object snippet)
      // Let's assume each outcome has an equal share for the simulation if not specified.
      // But usually, we want the CURRENT outcome pool.
      // For now, let's use a mock outcome pool of 1/N of total pool if not available.
      const outcomePoolBig = totalPoolBig / BigInt(market.outcomes.length || 1);
      
      if (outcomePoolBig === 0n) return 0n;

      // Formula: payout = (stake * total_pool * 97) / (outcome_pool * 100)
      const payoutBig = (stakeBig * totalPoolBig * 97n) / (outcomePoolBig * 100n);
      return payoutBig;
    } catch {
      return 0n;
    }
  };

  const payoutBig = useMemo(() => calculatePayout(stake), [stake, market]);
  const payoutXlm = Number(payoutBig) / 1e7;
  const impliedProb = (100 / market.outcomes.length).toFixed(1);

  const chartData = [
    { name: "Profit if Correct", value: Math.max(0, payoutXlm - parseFloat(stake || "0")), color: "#4ade80" },
    { name: "Stake at Risk", value: parseFloat(stake || "0"), color: "#f87171" },
  ];

  const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setStake(val);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-white font-semibold">What-If Simulator</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-5 pt-0 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="stake-range" className="text-gray-400 text-sm">Your Stake (XLM)</label>
              <input
                type="text"
                value={stake}
                onChange={handleStakeChange}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-right w-24 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <input
              id="stake-range"
              type="range"
              min="1"
              max="10000"
              step="1"
              value={parseFloat(stake) || 0}
              onChange={(e) => setStake(e.target.value)}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 h-48">
            <div className="flex flex-col justify-center space-y-4">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider">Projected Payout</p>
                <p className="text-2xl font-bold text-green-400">{payoutXlm.toFixed(2)} XLM</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider">Implied Prob</p>
                <p className="text-xl font-bold text-blue-400">{impliedProb}%</p>
              </div>
            </div>
            
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-gray-500 text-[10px] leading-tight italic">
            * Calculations based on BigInt stroop arithmetic including a 3% platform fee.
          </p>
        </div>
      )}
    </div>
  );
}
