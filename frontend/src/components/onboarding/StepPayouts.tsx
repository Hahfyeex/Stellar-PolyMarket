"use client";
/**
 * Step 4 — Payouts
 * Explains how winnings are calculated with a worked example.
 */

export default function StepPayouts() {
  // Example values for the payout illustration
  const totalPool = 1000;
  const yourStake = 200;
  const winningSide = 600;
  const platformFee = 0.03;
  const payoutPool = totalPool * (1 - platformFee);
  const yourPayout = (yourStake / winningSide) * payoutPool;
  const profit = yourPayout - yourStake;

  return (
    <div className="flex flex-col gap-5">
      {/* Icon + title */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-yellow-400">
            <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">How Payouts Work</h2>
          <p className="text-gray-500 text-xs">Your share of the winning pool</p>
        </div>
      </div>

      {/* Example calculation */}
      <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Example</p>

        <div className="flex flex-col gap-2 text-sm">
          {[
            { label: "Total pool", value: `${totalPool} XLM`, color: "text-white" },
            { label: "Your stake (Yes)", value: `${yourStake} XLM`, color: "text-white" },
            { label: "Total staked on Yes", value: `${winningSide} XLM`, color: "text-white" },
            { label: "Platform fee (3%)", value: `${(totalPool * platformFee).toFixed(0)} XLM`, color: "text-gray-400" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="text-gray-400">{row.label}</span>
              <span className={row.color}>{row.value}</span>
            </div>
          ))}

          <div className="border-t border-gray-700 pt-2 mt-1 flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-gray-300 font-medium">Your payout</span>
              <span className="text-green-400 font-bold">{yourPayout.toFixed(2)} XLM</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-xs">Profit</span>
              <span className="text-green-400 text-xs">+{profit.toFixed(2)} XLM</span>
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-xs mt-1">
          Formula: <span className="text-gray-300 font-mono">(your stake / winning side) × payout pool</span>
        </p>
      </div>

      {/* Ready CTA */}
      <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4 text-center">
        <p className="text-blue-300 text-sm font-medium">You're ready to start predicting!</p>
        <p className="text-gray-500 text-xs mt-1">
          Click "Get Started" to explore live markets.
        </p>
      </div>
    </div>
  );
}
