"use client";
/**
 * Profile Page
 *
 * Displays the connected user's reputation badge, prediction stats,
 * and participation history. Badge tier is computed client-side from
 * stats fetched via GET /api/users/:wallet/stats.
 */
import { useWalletContext } from "../../context/WalletContext";
import { useUserBadge } from "../../hooks/useUserBadge";
import { ReputationBadgeWithLabel } from "../../components/ReputationBadge";
import { BADGE_TIERS } from "../../utils/badgeTier";
import WalletActivityTimeline from "../../components/timeline/WalletActivityTimeline";

// ── Mock data — replace with real API calls ──────────────────────────────────
const MOCK_RECENT_PREDICTIONS = [
  { id: 1, question: "Will XLM reach $0.50 by end of March 2026?", outcome: "Yes", result: "correct", payout: "12.50 XLM" },
  { id: 2, question: "Will the Stellar Development Foundation release a new SDK?", outcome: "Yes", result: "correct", payout: "8.20 XLM" },
  { id: 3, question: "Will BTC drop below $60K in Q1 2026?", outcome: "No", result: "incorrect", payout: "0 XLM" },
  { id: 4, question: "Will global DEX volume exceed $5B in February?", outcome: "Yes", result: "correct", payout: "22.10 XLM" },
  { id: 5, question: "Will ETH 2.0 staking APY drop below 3%?", outcome: "No", result: "correct", payout: "6.75 XLM" },
];
// ─────────────────────────────────────────────────────────────────────────────

function abbreviateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export default function ProfilePage() {
  const { publicKey, connecting, connect } = useWalletContext();
  const { tier, stats, isLoading, error } = useUserBadge();

  // ── Wallet not connected ──────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-gray-400">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Your Profile</h1>
            <p className="text-gray-400 text-sm mt-1">
              Connect your wallet to view your reputation badge and stats.
            </p>
          </div>
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white font-semibold transition-colors"
          >
            {connecting ? "Connecting..." : "Connect Freighter Wallet"}
          </button>
        </div>
      </main>
    );
  }

  // ── Loading stats ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading your stats...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-base leading-none">Profile</h1>
            <p className="text-gray-500 text-xs font-mono mt-0.5">{abbreviateWallet(publicKey)}</p>
          </div>
          <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            ← Markets
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Profile card with badge */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Badge (96px) */}
          <div className="flex-shrink-0">
            {tier ? (
              <ReputationBadgeWithLabel tier={tier} size={96} />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-10 h-10 text-gray-600">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="text-xs text-gray-600 uppercase tracking-widest">No badge yet</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <h2 className="text-white font-bold text-lg">Reputation</h2>
              <p className="text-gray-500 text-sm mt-0.5">
                {tier
                  ? `You've earned the ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier.`
                  : "Participate in 10+ markets to earn your first badge."}
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                Could not load stats: {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white tabular-nums">
                  {stats?.marketsCount ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Markets Joined</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400 tabular-nums">
                  {stats ? `${stats.accuracyPct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Prediction Accuracy</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tier progression */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
            Badge Tiers
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...BADGE_TIERS].reverse().map(({ tier: t, minMarkets, minAccuracy }) => {
              const isUnlocked = tier === t || (stats
                ? stats.marketsCount >= minMarkets && stats.accuracyPct >= minAccuracy
                : false);

              return (
                <div
                  key={t}
                  className={`bg-gray-900 border rounded-xl p-3 text-center transition-colors ${
                    tier === t
                      ? "border-indigo-600 bg-indigo-950/20"
                      : isUnlocked
                      ? "border-gray-700"
                      : "border-gray-800 opacity-50"
                  }`}
                >
                  <div className="flex justify-center">
                    <ReputationBadge tier={t} size={48} />
                  </div>
                  <p className="text-white text-xs font-semibold mt-2 capitalize">{t}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{minMarkets}+ markets</p>
                  {minAccuracy > 0 && (
                    <p className="text-gray-600 text-xs">{minAccuracy}%+ accuracy</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent predictions */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
            Recent Predictions
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {MOCK_RECENT_PREDICTIONS.map((prediction, index) => (
              <div
                key={prediction.id}
                className={`flex items-center justify-between px-4 py-3 gap-4 ${
                  index < MOCK_RECENT_PREDICTIONS.length - 1 ? "border-b border-gray-800" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      prediction.result === "correct" ? "bg-green-400" : "bg-red-500"
                    }`}
                  />
                  <p className="text-gray-300 text-sm truncate">{prediction.question}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-gray-500 text-xs">→ {prediction.outcome}</span>
                  <span
                    className={`text-xs font-medium ${
                      prediction.result === "correct" ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {prediction.payout}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Activity Timeline */}
        <WalletActivityTimeline walletAddress={publicKey} />
      </div>
    </main>
  );
}
