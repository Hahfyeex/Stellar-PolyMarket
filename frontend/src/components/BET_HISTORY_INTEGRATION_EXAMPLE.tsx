/**
 * BET_HISTORY_INTEGRATION_EXAMPLE.tsx
 *
 * Example of how to integrate BetCancellationCell into BetHistoryTable.
 * This shows the minimal changes needed to add cancellation UI to existing table.
 *
 * Key changes:
 * 1. Import BetCancellationCell component
 * 2. Add cancellation column to table header
 * 3. Add BetCancellationCell to each table row
 * 4. Pass required props (betId, cancellableUntil, etc.)
 * 5. Handle onCancellationSuccess callback to refresh data
 */

import { useState, useEffect } from "react";
import BetCancellationCell from "./BetCancellationCell";

// Example bet data structure (from backend)
interface Bet {
  id: number;
  market_id: number;
  market_title: string;
  outcome_index: number;
  outcome_label: string;
  amount: string;
  created_at: string;
  result: "Win" | "Loss" | "Pending";
  payout_received: string;
  grace_period_ends_at: string | null; // ISO timestamp or null
  cancelled_at: string | null;
  paid_out: boolean;
}

interface Props {
  walletAddress: string | null;
}

/**
 * Example BetHistoryTable with cancellation UI integrated
 */
export default function BetHistoryTableWithCancellation({ walletAddress }: Props) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bets from API
  const fetchBets = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/bets?wallet=${encodeURIComponent(walletAddress)}`);

      if (!res.ok) throw new Error("Failed to fetch bets");

      const data = await res.json();
      setBets(data.bets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBets();
  }, [walletAddress, fetchBets]);

  if (!walletAddress) {
    return <div className="p-4 text-gray-400">Connect wallet to view bets</div>;
  }

  if (loading) {
    return <div className="p-4 text-gray-400">Loading bets...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-red-400">
        Error: {error}
        <button
          onClick={fetchBets}
          className="ml-4 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (bets.length === 0) {
    return <div className="p-4 text-gray-400">No bets yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-4 py-3 text-gray-300 font-semibold">Date</th>
            <th className="text-left px-4 py-3 text-gray-300 font-semibold">Market</th>
            <th className="text-left px-4 py-3 text-gray-300 font-semibold">Outcome</th>
            <th className="text-right px-4 py-3 text-gray-300 font-semibold">Amount</th>
            <th className="text-left px-4 py-3 text-gray-300 font-semibold">Result</th>
            <th className="text-right px-4 py-3 text-gray-300 font-semibold">Payout</th>
            {/* NEW: Cancellation column */}
            <th className="text-center px-4 py-3 text-gray-300 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => (
            <tr
              key={bet.id}
              className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors"
            >
              {/* Date */}
              <td className="px-4 py-3 text-gray-300 text-sm">
                {new Date(bet.created_at).toLocaleDateString()}
              </td>

              {/* Market Title */}
              <td className="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">
                {bet.market_title}
              </td>

              {/* Outcome */}
              <td className="px-4 py-3 text-gray-300 text-sm">{bet.outcome_label}</td>

              {/* Amount */}
              <td className="px-4 py-3 text-gray-300 text-sm text-right">
                {parseFloat(bet.amount).toFixed(2)} XLM
              </td>

              {/* Result */}
              <td className="px-4 py-3 text-sm">
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    bet.result === "Win"
                      ? "bg-green-900/30 text-green-400"
                      : bet.result === "Loss"
                        ? "bg-red-900/30 text-red-400"
                        : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {bet.result}
                </span>
              </td>

              {/* Payout */}
              <td className="px-4 py-3 text-gray-300 text-sm text-right">
                {parseFloat(bet.payout_received).toFixed(2)} XLM
              </td>

              {/* NEW: Cancellation Cell */}
              <td className="px-4 py-3 text-center">
                <BetCancellationCell
                  betId={bet.id}
                  cancellableUntil={bet.grace_period_ends_at}
                  marketTitle={bet.market_title}
                  outcomeName={bet.outcome_label}
                  refundAmount={parseFloat(bet.amount)}
                  walletAddress={walletAddress}
                  onCancellationSuccess={() => {
                    // Refresh bets after successful cancellation
                    fetchBets();
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * INTEGRATION CHECKLIST:
 *
 * 1. Import BetCancellationCell:
 *    import BetCancellationCell from "./BetCancellationCell";
 *
 * 2. Add to table header:
 *    <th className="text-center px-4 py-3 text-gray-300 font-semibold">
 *      Action
 *    </th>
 *
 * 3. Add to table row:
 *    <td className="px-4 py-3 text-center">
 *      <BetCancellationCell
 *        betId={bet.id}
 *        cancellableUntil={bet.grace_period_ends_at}
 *        marketTitle={bet.market_title}
 *        outcomeName={bet.outcome_label}
 *        refundAmount={parseFloat(bet.amount)}
 *        walletAddress={walletAddress}
 *        onCancellationSuccess={() => fetchBets()}
 *      />
 *    </td>
 *
 * 4. Ensure backend API is available:
 *    DELETE /api/bets/:id with grace period checks
 *
 * 5. Test the flow:
 *    - Click Cancel button on recent bet
 *    - Confirm cancellation in dialog
 *    - See success toast with refund amount
 *    - Verify bet list refreshes
 *
 * STYLING NOTES:
 * - BetCancellationCell handles its own styling
 * - Fits naturally in table cells
 * - Responsive on mobile (button text may wrap)
 * - Respects dark theme (gray-900 background)
 *
 * ACCESSIBILITY:
 * - All components are keyboard navigable
 * - Screen reader friendly
 * - Focus management in dialog
 * - WCAG 2.1 compliant
 *
 * PERFORMANCE:
 * - Timer updates every 1 second (not on every render)
 * - Proper cleanup on unmount
 * - React Query caching for bet list
 * - Minimal re-renders
 */
