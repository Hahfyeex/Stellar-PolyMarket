"use client";
/**
 * BetSlipSummary (#591)
 *
 * Full-screen overlay shown before Freighter signing.
 * Translates raw Stellar transaction data into plain-language summary.
 * All amounts are computed from stroop integers — no floating point.
 */

export interface BetSlipSummaryProps {
  marketQuestion: string;
  outcomeLabel: string;
  /** Stake in stroops (integer) */
  stakeStroops: bigint;
  /** Fee rate in basis points */
  feeRateBps: number;
  /** Estimated payout in stroops if correct */
  estimatedPayoutStroops: bigint;
  /** Current implied odds at time of entry (basis points, 0–10000) */
  entryOddsBps: number;
  /** Current implied odds now (basis points) — triggers slippage warning if different */
  currentOddsBps: number;
  onConfirm: () => void;
  onBack: () => void;
}

const STROOPS_PER_XLM = 10_000_000n;
const SLIPPAGE_THRESHOLD_BPS = 50; // 0.5%

function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  return `${whole}.${frac.toString().padStart(7, "0")}`;
}

export default function BetSlipSummary({
  marketQuestion,
  outcomeLabel,
  stakeStroops,
  feeRateBps,
  estimatedPayoutStroops,
  entryOddsBps,
  currentOddsBps,
  onConfirm,
  onBack,
}: BetSlipSummaryProps) {
  const feeStroops = (stakeStroops * BigInt(feeRateBps)) / 10_000n;
  const netPayoutStroops = estimatedPayoutStroops - feeStroops;
  const oddsDrift = Math.abs(currentOddsBps - entryOddsBps);
  const hasSlippage = oddsDrift > SLIPPAGE_THRESHOLD_BPS;

  return (
    <div
      data-testid="bet-slip-summary"
      className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
        <button
          data-testid="bet-slip-back"
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Back to bet form"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold">Review Your Bet</h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {/* Slippage warning */}
        {hasSlippage && (
          <div
            data-testid="slippage-warning"
            role="alert"
            className="bg-yellow-900/40 border border-yellow-600 rounded-xl px-4 py-3 text-yellow-300 text-sm"
          >
            ⚠️ Odds have changed since you entered your amount. Current odds may differ from
            expected.
          </div>
        )}

        <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
          <Row label="Market" value={marketQuestion} />
          <Row label="Outcome" value={outcomeLabel} highlight />
          <Row label="Stake" value={`${stroopsToXlm(stakeStroops)} XLM`} />
          <Row label="Estimated Payout" value={`${stroopsToXlm(estimatedPayoutStroops)} XLM`} />
          <Row label="Platform Fee" value={`${stroopsToXlm(feeStroops)} XLM`} />
          <Row
            label="Net Payout After Fee"
            value={`${stroopsToXlm(netPayoutStroops)} XLM`}
            highlight
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800">
        <button
          data-testid="bet-slip-confirm"
          onClick={onConfirm}
          className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-xl font-bold transition-colors"
        >
          Confirm &amp; Sign with Freighter
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 gap-4">
      <span className="text-gray-400 text-sm shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${highlight ? "text-blue-400 font-semibold" : "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}
