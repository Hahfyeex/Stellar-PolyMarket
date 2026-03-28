"use client";
/**
 * Step 2 — How Markets Work
 * Static explainer with a simple market mechanics diagram.
 */

export default function StepMarkets() {
  return (
    <div className="flex flex-col gap-5">
      {/* Icon + title */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-900/40 border border-blue-700/50 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-blue-400">
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">How Markets Work</h2>
          <p className="text-gray-500 text-xs">Collective intelligence, on-chain</p>
        </div>
      </div>

      {/* Mechanics diagram */}
      <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col gap-3">
        {[
          {
            icon: "📋",
            title: "A question is posed",
            desc: "e.g. \u201cWill BTC reach $100k before 2027?\u201d",
          },
          {
            icon: "💰",
            title: "Users stake XLM on outcomes",
            desc: "Yes or No — your stake determines your share of the pool.",
          },
          {
            icon: "🔮",
            title: "An oracle resolves the market",
            desc: "External data confirms the real-world result.",
          },
          {
            icon: "🏆",
            title: "Winners share the pool",
            desc: "Proportional to their stake. Losers forfeit their stake.",
          },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
            <div>
              <p className="text-white text-sm font-medium">{item.title}</p>
              <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-500 text-xs text-center">
        All funds are locked in Soroban smart contracts — transparent and tamper-proof.
      </p>
    </div>
  );
}
