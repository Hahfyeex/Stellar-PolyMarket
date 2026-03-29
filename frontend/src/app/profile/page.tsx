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
import { ReputationBadgeWithLabel, ReputationBadge } from "../../components/ReputationBadge";
import { BADGE_TIERS } from "../../utils/badgeTier";
import WalletActivityTimeline from "../../components/timeline/WalletActivityTimeline";
import NotificationPreferencesPanel from "../../components/NotificationPreferencesPanel";
import BetHistoryTable from "../../components/BetHistoryTable";
import { usePortfolio } from "../../hooks/usePortfolio";
import PortfolioSkeleton from "../../components/skeletons/PortfolioSkeleton";


function abbreviateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

interface PortfolioSummaryProps {
  summary: {
    total_invested: string;
    total_payout: string;
    total_p_and_l: string;
    win_rate: string;
  };
}

function PortfolioSummary({ summary }: PortfolioSummaryProps) {
  const pnl = parseFloat(summary.total_p_and_l);
  const winRate = parseFloat(summary.win_rate) * 100;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Total Invested</p>
        <p className="text-white text-xl font-bold mt-1">{parseFloat(summary.total_invested).toFixed(2)} XLM</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Total Payout</p>
        <p className="text-white text-xl font-bold mt-1">{parseFloat(summary.total_payout).toFixed(2)} XLM</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Net P&L</p>
        <p className={`text-xl font-bold mt-1 ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} XLM
        </p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Win Rate</p>
        <p className="text-white text-xl font-bold mt-1">{winRate.toFixed(1)}%</p>
      </div>
    </div>
  );
}


export default function ProfilePage() {
  const { publicKey, isLoading, walletError, connect } = useWalletContext();
  const { tier, stats, isLoading: badgeLoading, error: badgeError } = useUserBadge();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(publicKey);

  const loadingStats = badgeLoading || portfolioLoading;


  // ── Wallet not connected ──────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-7 h-7 text-gray-400"
            >
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
            disabled={isLoading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white font-semibold transition-colors"
          >
            {isLoading ? "Connecting..." : "Connect Freighter Wallet"}
          </button>
        </div>
      </main>
    );
  }

  // ── Loading stats ─────────────────────────────────────────────────────────
  if (loadingStats) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-white font-bold text-base leading-none">Profile</h1>
            </div>
            <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
              ← Markets
            </a>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <PortfolioSkeleton />
        </div>
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="w-10 h-10 text-gray-600"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="text-xs text-gray-600 uppercase tracking-widest">
                  No badge yet
                </span>
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

            {walletError && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                Could not load stats: {walletError}
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

        {/* Portfolio Summary */}
        {portfolio && <PortfolioSummary summary={portfolio.summary} />}


        {/* Tier progression */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
            Badge Tiers
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...BADGE_TIERS].reverse().map(({ tier: t, minMarkets, minAccuracy }) => {
              const isUnlocked =
                tier === t ||
                (stats
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

        {/* Recent predictions (Real Data) */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            {(!portfolio?.recent_activity || portfolio.recent_activity.length === 0) ? (
              <div className="p-8 text-center text-gray-500">No recent activity</div>
            ) : (
              portfolio.recent_activity.map((bet, index) => {
                const isCorrect = bet.is_resolved && bet.winning_outcome === bet.outcome_index;
                const isIncorrect = bet.is_resolved && bet.winning_outcome !== bet.outcome_index;
                const payout = parseFloat(bet.payout);

                return (
                  <div
                    key={bet.bet_id}
                    className={`flex items-center justify-between px-4 py-4 gap-4 hover:bg-gray-800/50 transition-colors ${
                      index < portfolio.recent_activity.length - 1 ? "border-b border-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                           isCorrect ? "bg-green-900 text-green-300" :
                           isIncorrect ? "bg-red-900 text-red-300" :
                           "bg-blue-900 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                        }`}
                      >
                        {bet.outcome_name?.[0] || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-gray-100 text-sm font-medium truncate">{bet.market_question}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {bet.outcome_name} · {new Date(bet.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-white text-sm font-semibold">{parseFloat(bet.amount).toFixed(2)} XLM</span>
                      {bet.is_resolved && (
                        <span className={`text-xs font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                          {payout > 0 ? `+${payout.toFixed(2)} XLM` : "0.00 XLM"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>


        {/* Bet History */}
        <section>
          <BetHistoryTable
            walletAddress={publicKey}
            apiUrl={process.env.NEXT_PUBLIC_API_URL ?? ""}
          />
        </section>

        {/* Activity Timeline */}
        <WalletActivityTimeline walletAddress={publicKey} />

        {/* Notification Preferences */}
        <NotificationPreferencesPanel walletAddress={publicKey} />
      </div>
    </main>
  );
}
