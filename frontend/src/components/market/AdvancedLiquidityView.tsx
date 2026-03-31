"use client";

import { useMemo } from "react";

export interface DepthBet {
  amount: string;
  outcome_index: number;
  created_at: string;
}

const H24_MS = 24 * 60 * 60 * 1000;

const BAR_BG = ["bg-emerald-700", "bg-rose-700", "bg-violet-700", "bg-amber-700"] as const;
const BAR_TEXT = ["text-emerald-400", "text-rose-400", "text-violet-400", "text-amber-400"] as const;

function filterBets24h(bets: DepthBet[]): DepthBet[] {
  const cutoff = Date.now() - H24_MS;
  return bets.filter((b) => new Date(b.created_at).getTime() >= cutoff);
}

function sumOutcome(bets: DepthBet[], idx: number): number {
  return bets
    .filter((b) => b.outcome_index === idx)
    .reduce((s, b) => s + parseFloat(b.amount || "0"), 0);
}

/**
 * 24h pool depth: implied “price” = share of 24h volume on that outcome;
 * “size” = XLM staked on that outcome in the window (treated like shares at that level).
 */
export default function AdvancedLiquidityView({
  bets,
  outcomes,
}: {
  bets: DepthBet[];
  outcomes: string[];
}) {
  const bets24 = useMemo(() => filterBets24h(bets), [bets]);

  const rows = useMemo(() => {
    const vol = outcomes.map((_, i) => sumOutcome(bets24, i));
    const total = vol.reduce((a, b) => a + b, 0);
    return outcomes.map((label, i) => {
      const v = vol[i] ?? 0;
      const price = total > 0 ? v / total : outcomes.length > 0 ? 1 / outcomes.length : 0;
      return { label, outcomeIndex: i, price, size: v, totalXlm: v };
    });
  }, [bets24, outcomes]);

  const sortedHighToLow = useMemo(() => [...rows].sort((a, b) => b.price - a.price), [rows]);
  const totalVol = useMemo(() => rows.reduce((s, r) => s + r.size, 0), [rows]);

  const askRow = sortedHighToLow[0];
  const bidRow = sortedHighToLow[1];
  const hasVol = totalVol > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white font-semibold text-lg">Liquidity depth</h3>
        <span className="text-xs text-gray-500 shrink-0">Last 24h</span>
      </div>

      {/* Depth chart: buy vs sell pressure = share of 24h volume per outcome */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <p className="text-gray-400 text-xs mb-2">
          Bar width shows each outcome’s fraction of 24h volume (deeper = more liquidity at that
          side).
        </p>
        <div className="flex h-10 rounded-lg overflow-hidden border border-gray-700">
          {rows.map((r) => {
            const pct = hasVol ? (r.size / totalVol) * 100 : 100 / Math.max(rows.length, 1);
            const bg = BAR_BG[r.outcomeIndex % BAR_BG.length];
            return (
              <div
                key={r.outcomeIndex}
                className={`flex items-center justify-center text-xs font-medium text-white/90 min-w-[2rem] ${bg}`}
                style={{ width: `${Math.max(pct, 4)}%` }}
                title={`${r.label}: ${pct.toFixed(1)}%`}
              >
                {pct >= 12 ? `${pct.toFixed(0)}%` : ""}
            </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
          {rows.map((r) => (
            <span key={r.outcomeIndex}>
              <span className={BAR_TEXT[r.outcomeIndex % BAR_TEXT.length]}>{r.label}</span>
              : {r.size.toFixed(2)} XLM
            </span>
          ))}
        </div>
      </div>

      {/* Order book table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-800 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-300">Order book</span>
          <span className="text-xs text-gray-500">Implied price · 24h</span>
        </div>
        <div className="overflow-x-auto -mx-0">
          <table className="w-full min-w-[280px] text-sm">
            <thead>
              <tr className="bg-gray-800/80 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium text-right">Price</th>
                <th className="px-3 py-2 font-medium text-right">Size (shares)</th>
                <th className="px-3 py-2 font-medium text-right">Total (XLM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {!hasVol ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                    No fills in the last 24h — depth chart shows an even split until there is
                    volume.
                  </td>
                </tr>
              ) : outcomes.length > 2 ? (
                sortedHighToLow.map((r) => (
                  <tr
                    key={r.outcomeIndex}
                    className={
                      r.outcomeIndex % 2 === 0 ? "bg-gray-900/50" : "bg-gray-800/30"
                    }
                  >
                    <td className="px-3 py-2.5 text-gray-200 font-medium">{r.label}</td>
                    <td className="px-3 py-2.5 text-right text-gray-100 tabular-nums">
                      {r.price.toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                      {r.size.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                      {r.totalXlm.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {askRow && (
                    <tr className="bg-rose-950/30">
                      <td className="px-3 py-2.5 text-rose-300 font-medium">
                        Ask · {askRow.label}
                      </td>
                      <td className="px-3 py-2.5 text-right text-rose-200 tabular-nums">
                        {askRow.price.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                        {askRow.size.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                        {askRow.totalXlm.toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-gray-800/50">
                    <td colSpan={4} className="px-3 py-1.5 text-center text-xs text-gray-500">
                      Spread (mid) ·{" "}
                      {askRow && bidRow
                        ? ((askRow.price + bidRow.price) / 2).toFixed(4)
                        : "—"}
                    </td>
                  </tr>
                  {bidRow && (
                    <tr className="bg-emerald-950/30">
                      <td className="px-3 py-2.5 text-emerald-300 font-medium">
                        Bid · {bidRow.label}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-200 tabular-nums">
                        {bidRow.price.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                        {bidRow.size.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                        {bidRow.totalXlm.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
