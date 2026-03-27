"use client";
/**
 * Leaderboard Page
 *
 * Ranks users by prediction accuracy and markets participated.
 * Each row renders a small (24px) ReputationBadge alongside wallet stats.
 * The connected user's row is highlighted and sorted to the top if present.
 */
import { useWalletContext } from "../../context/WalletContext";
import dynamic from "next/dynamic";
import type { LeaderboardEntry } from "../../components/LeaderboardRow";

// Lazy-load — leaderboard table is heavy enough to warrant code splitting
const LeaderboardRow = dynamic(
  () => import("../../components/LeaderboardRow").then((m) => ({ default: m.LeaderboardRow })),
  { ssr: false }
);

// ── Mock data — replace with GET /api/leaderboard ────────────────────────────
const MOCK_ENTRIES: LeaderboardEntry[] = [
  { rank: 1,  walletAddress: "GDIAMOND7XKLMNOPQRSTUVWXYZ1234ABCDEF",  marketsCount: 312, accuracyPct: 81.4 },
  { rank: 2,  walletAddress: "GGOLD4ABCDEFGHIJKLMNOPQRSTUVWXY56789",  marketsCount: 245, accuracyPct: 76.2 },
  { rank: 3,  walletAddress: "GSILVER3MNOPQRSTUVWXYZ0123456789ABCD",  marketsCount: 189, accuracyPct: 69.8 },
  { rank: 4,  walletAddress: "GBRONZE2ABCDEFGHIJKLMNOPQRSTUVW12345",  marketsCount: 134, accuracyPct: 63.1 },
  { rank: 5,  walletAddress: "GUSER5NOPQRSTUVWXYZABCDEFG1234567890",  marketsCount: 98,  accuracyPct: 58.7 },
  { rank: 6,  walletAddress: "GUSER6OPQRSTUVWXYZABCDEFGH123456789A",  marketsCount: 67,  accuracyPct: 54.3 },
  { rank: 7,  walletAddress: "GUSER7PQRSTUVWXYZABCDEFGHI1234567890",  marketsCount: 45,  accuracyPct: 51.0 },
  { rank: 8,  walletAddress: "GUSER8QRSTUVWXYZABCDEFGHIJ123456789B",  marketsCount: 28,  accuracyPct: 47.5 },
  { rank: 9,  walletAddress: "GUSER9RSTUVWXYZABCDEFGHIJK1234567890",  marketsCount: 14,  accuracyPct: 42.8 },
  { rank: 10, walletAddress: "GUSER10STUVWXYZABCDEFGHIJKL123456789", marketsCount: 11,  accuracyPct: 36.4 },
];
// ─────────────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { publicKey } = useWalletContext();

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-900/50 border border-yellow-700 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-yellow-400">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-none">Leaderboard</h1>
              <p className="text-yellow-600 text-xs">Top predictors</p>
            </div>
          </div>
          <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            ← Markets
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Predictors", value: "1,284", color: "text-white" },
            { label: "Avg Accuracy", value: "54.2%", color: "text-green-400" },
            { label: "Diamond Tier", value: "12", color: "text-cyan-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider w-12">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Predictor
                </th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">
                  Markets
                </th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">
                  Accuracy
                </th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ENTRIES.map((entry) => (
                <LeaderboardRow
                  key={entry.walletAddress}
                  entry={entry}
                  isCurrentUser={!!publicKey && entry.walletAddress === publicKey}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-gray-600 text-xs">
          Showing top 10 predictors · Updated every 10 minutes
        </p>
      </div>
    </main>
  );
}
