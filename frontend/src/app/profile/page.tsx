"use client";
import Link from "next/link";
import { useWalletContext } from "../../context/WalletContext";
import { useUserBadge } from "../../hooks/useUserBadge";
import { usePortfolio } from "../../hooks/usePortfolio";
import { useReferralStats } from "../../hooks/useReferralStats";
import { ReputationBadge, ReputationBadgeWithLabel } from "../../components/ReputationBadge";
import ReferralSection from "../../components/ReferralSection";
import WalletActivityTimeline from "../../components/timeline/WalletActivityTimeline";
import NotificationPreferencesPanel from "../../components/NotificationPreferencesPanel";
import BetHistoryTable from "../../components/BetHistoryTable";
import PortfolioSkeleton from "../../components/skeletons/PortfolioSkeleton";
import { BADGE_TIERS } from "../../utils/badgeTier";

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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Total Invested
        </p>
        <p className="mt-2 text-xl font-bold text-white">
          {parseFloat(summary.total_invested).toFixed(2)} XLM
        </p>
      </div>
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Total Payout
        </p>
        <p className="mt-2 text-xl font-bold text-white">
          {parseFloat(summary.total_payout).toFixed(2)} XLM
        </p>
      </div>
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Net P&amp;L</p>
        <p className={`mt-2 text-xl font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          {pnl >= 0 ? "+" : ""}
          {pnl.toFixed(2)} XLM
        </p>
      </div>
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Win Rate</p>
        <p className="mt-2 text-xl font-bold text-white">{winRate.toFixed(1)}%</p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { publicKey, walletError, connect } = useWalletContext();
  const { tier, stats, isLoading: badgeLoading, error: badgeError } = useUserBadge();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(publicKey);
  const {
    stats: referralStats,
    isLoading: referralLoading,
    error: referralError,
  } = useReferralStats(publicKey);

  const loadingStats = badgeLoading || portfolioLoading || referralLoading;
  const loadError = walletError || badgeError || referralError;

  if (!publicKey) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <header className="flex items-center justify-between rounded-3xl border border-gray-800 bg-gray-900/80 px-6 py-4 backdrop-blur-sm">
            <div>
              <h1 className="text-xl font-semibold text-white">Profile</h1>
              <p className="mt-1 text-sm text-gray-400">Connect your wallet to view your dashboard.</p>
            </div>
            <Link href="/" className="text-sm font-medium text-indigo-300 transition hover:text-indigo-200">
              Back to Markets
            </Link>
          </header>

          <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/30 p-8 text-center shadow-xl">
            <h2 className="text-2xl font-semibold text-white">Connect to unlock your referral hub</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-gray-400">
              We&apos;ll generate your wallet-based referral code, track referred bettors, and show your referral bonus here.
            </p>
            <button
              type="button"
              onClick={connect}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Connect Wallet
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (loadingStats) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <PortfolioSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between rounded-3xl border border-gray-800 bg-gray-900/80 px-6 py-4 backdrop-blur-sm">
          <div>
            <h1 className="text-xl font-semibold text-white">Profile</h1>
            <p className="mt-1 font-mono text-xs text-gray-500">{abbreviateWallet(publicKey)}</p>
          </div>
          <Link href="/" className="text-sm font-medium text-indigo-300 transition hover:text-indigo-200">
            Back to Markets
          </Link>
        </header>

        <section className="rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex justify-center sm:block">
              {tier ? (
                <ReputationBadgeWithLabel tier={tier} size={96} />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-gray-700 bg-gray-950">
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-500">New</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Reputation</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {tier
                    ? `You've earned the ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier.`
                    : "Participate in 10+ markets to earn your first badge."}
                </p>
              </div>

              {loadError ? (
                <p className="rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                  Some profile data could not be loaded: {loadError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-center">
                  <p className="text-2xl font-bold text-white tabular-nums">{stats?.marketsCount ?? 0}</p>
                  <p className="mt-1 text-xs text-gray-500">Markets Joined</p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-center">
                  <p className="text-2xl font-bold text-green-400 tabular-nums">
                    {stats ? `${stats.accuracyPct.toFixed(1)}%` : "0.0%"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Prediction Accuracy</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {portfolio ? <PortfolioSummary summary={portfolio.summary} /> : null}

        <ReferralSection
          walletAddress={publicKey}
          referredUsers={referralStats.referredUsers}
          totalBonusEarned={referralStats.totalBonusEarned}
        />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
            Badge Tiers
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[...BADGE_TIERS].reverse().map(({ tier: badgeTier, minMarkets, minAccuracy }) => {
              const isUnlocked =
                tier === badgeTier ||
                (stats
                  ? stats.marketsCount >= minMarkets && stats.accuracyPct >= minAccuracy
                  : false);

              return (
                <div
                  key={badgeTier}
                  className={`rounded-2xl border p-4 text-center ${
                    tier === badgeTier
                      ? "border-indigo-500/40 bg-indigo-950/20"
                      : isUnlocked
                        ? "border-gray-700 bg-gray-900"
                        : "border-gray-800 bg-gray-900/60 opacity-60"
                  }`}
                >
                  <div className="flex justify-center">
                    <ReputationBadge tier={badgeTier} size={48} />
                  </div>
                  <p className="mt-3 text-sm font-semibold capitalize text-white">{badgeTier}</p>
                  <p className="mt-1 text-xs text-gray-500">{minMarkets}+ markets</p>
                  {minAccuracy > 0 ? (
                    <p className="text-xs text-gray-600">{minAccuracy}%+ accuracy</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
            Recent Activity
          </h2>
          <div className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 shadow-xl">
            {!portfolio?.recent_activity || portfolio.recent_activity.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No recent activity</div>
            ) : (
              portfolio.recent_activity.map((bet, index) => {
                const isCorrect = bet.is_resolved && bet.winning_outcome === bet.outcome_index;
                const isIncorrect = bet.is_resolved && bet.winning_outcome !== bet.outcome_index;
                const payout = parseFloat(bet.payout);

                return (
                  <div
                    key={bet.bet_id}
                    className={`flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-gray-800/50 ${
                      index < portfolio.recent_activity.length - 1 ? "border-b border-gray-800" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                          isCorrect
                            ? "bg-green-900 text-green-300"
                            : isIncorrect
                              ? "bg-red-900 text-red-300"
                              : "bg-blue-900 text-blue-300"
                        }`}
                      >
                        {bet.outcome_name?.[0] || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-100">{bet.market_question}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {bet.outcome_name} · {new Date(bet.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-white">
                        {parseFloat(bet.amount).toFixed(2)} XLM
                      </span>
                      {bet.is_resolved ? (
                        <span className={`text-xs font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                          {payout > 0 ? `+${payout.toFixed(2)} XLM` : "0.00 XLM"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <BetHistoryTable walletAddress={publicKey} apiUrl={process.env.NEXT_PUBLIC_API_URL ?? ""} />
        </section>

        <WalletActivityTimeline walletAddress={publicKey} />

        <NotificationPreferencesPanel walletAddress={publicKey} />
      </div>
    </main>
  );
}
