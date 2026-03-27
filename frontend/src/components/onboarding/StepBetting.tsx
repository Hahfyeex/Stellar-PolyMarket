"use client";
/**
 * Step 3 — Place a Bet
 * Demo MarketCard with a disabled bet form so users can see the UI
 * without accidentally submitting a real transaction.
 */

export default function StepBetting() {
  return (
    <div className="flex flex-col gap-5">
      {/* Icon + title */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-green-900/40 border border-green-700/50 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-green-400">
            <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">Placing a Bet</h2>
          <p className="text-gray-500 text-xs">Here's what a real market looks like</p>
        </div>
      </div>

      {/* Demo market card */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-col gap-3 relative">
        {/* Demo badge */}
        <span className="absolute top-3 right-3 text-xs bg-yellow-900/60 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded-full">
          Demo
        </span>

        <div>
          <p className="text-white font-semibold text-sm leading-snug pr-16">
            Will Bitcoin reach $100k before 2027?
          </p>
          <p className="text-gray-500 text-xs mt-1">Pool: 4,200 XLM · Ends Dec 31, 2026</p>
        </div>

        {/* Outcome buttons */}
        <div className="flex gap-2">
          {["Yes", "No"].map((outcome, i) => (
            <button
              key={outcome}
              disabled
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-not-allowed ${
                i === 0
                  ? "bg-blue-600/60 text-blue-200"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {outcome}
            </button>
          ))}
        </div>

        {/* Disabled bet input */}
        <div className="flex gap-2 opacity-60">
          <input
            type="number"
            placeholder="Amount (XLM)"
            disabled
            className="bg-gray-700 text-gray-400 rounded-lg px-3 py-2 text-sm flex-1 outline-none border border-gray-600 cursor-not-allowed"
          />
          <button
            disabled
            className="bg-blue-600/50 text-blue-300 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed"
          >
            Bet
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs text-gray-400">
        <p>① Select an outcome (Yes or No)</p>
        <p>② Enter your stake amount in XLM</p>
        <p>③ Click Bet — Freighter will ask you to approve the transaction</p>
      </div>
    </div>
  );
}
