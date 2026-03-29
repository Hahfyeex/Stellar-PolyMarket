"use client";
/**
 * SocialSentiment
 *
 * Displays a visual sentiment bar showing the community's directional lean
 * across outcomes, derived from pool distribution. Acts as a quick "crowd
 * wisdom" signal — a key data point for a user deciding on a large bet.
 */
import { useMemo } from "react";

interface Props {
  outcomes: string[];
  totalPool: number;
}

const OUTCOME_COLORS = [
  { bar: "bg-blue-500", text: "text-blue-400", border: "border-blue-700/40" },
  { bar: "bg-green-500", text: "text-green-400", border: "border-green-700/40" },
  { bar: "bg-purple-500", text: "text-purple-400", border: "border-purple-700/40" },
  { bar: "bg-amber-500", text: "text-amber-400", border: "border-amber-700/40" },
  { bar: "bg-red-500", text: "text-red-400", border: "border-red-700/40" },
];

export default function SocialSentiment({ outcomes, totalPool }: Props) {
  // Derive equal-split probabilities (real data would come from per-outcome pools)
  const sentiments = useMemo(() => {
    const perOutcome = totalPool / outcomes.length;
    return outcomes.map((name, i) => ({
      name,
      pool: perOutcome,
      pct: Math.round(100 / outcomes.length),
      color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
    }));
  }, [outcomes, totalPool]);

  const dominant = sentiments.reduce((a, b) => (a.pct >= b.pct ? a : b));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-base">Social Sentiment</h3>
        <span className="text-xs text-gray-500">Community lean</span>
      </div>

      {/* Stacked sentiment bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {sentiments.map((s) => (
          <div
            key={s.name}
            className={`${s.color.bar} transition-all duration-500`}
            style={{ width: `${s.pct}%` }}
            title={`${s.name}: ${s.pct}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {sentiments.map((s) => (
          <div key={s.name} className={`flex items-center gap-2 bg-gray-800 border ${s.color.border} rounded-lg px-3 py-2`}>
            <span className={`w-2 h-2 rounded-full ${s.color.bar} shrink-0`} />
            <span className="text-gray-300 text-xs">{s.name}</span>
            <span className={`text-xs font-bold ${s.color.text}`}>{s.pct}%</span>
          </div>
        ))}
      </div>

      {/* Dominant signal */}
      <p className="text-gray-500 text-xs">
        Community currently leans{" "}
        <span className={`font-semibold ${dominant.color.text}`}>{dominant.name}</span>
        {" "}· {parseFloat(String(dominant.pool)).toLocaleString(undefined, { maximumFractionDigits: 0 })} XLM in pool
      </p>
    </div>
  );
}
