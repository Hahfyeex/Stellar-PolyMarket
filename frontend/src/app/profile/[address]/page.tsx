"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CopyButton from "../../../components/CopyButton";
import { ReputationBadgeWithLabel } from "../../../components/ReputationBadge";
import { useWalletContext } from "../../../context/WalletContext";
import { validateStellarAddress } from "../../../lib/stellar";
import { BADGE_TIERS, type BadgeTier } from "../../../utils/badgeTier";

type ApiBadge = BadgeTier | { tier?: string | null } | null;

interface ProfileActivity {
  id: string;
  marketQuestion: string;
  outcomeName: string;
  amount: number;
  createdAt: string;
  result: string | null;
}

interface ProfileData {
  address: string;
  displayName: string | null;
  accuracyPct: number;
  marketsParticipated: number;
  totalVolumeXlm: number;
  netPnlXlm: number;
  winCount: number;
  lossCount: number;
  badges: BadgeTier[];
  recentActivity: ProfileActivity[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function abbreviateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeBadgeTier(value: ApiBadge): BadgeTier | null {
  const tier = typeof value === "string" ? value : value?.tier;
  if (tier === "bronze" || tier === "silver" || tier === "gold" || tier === "diamond") {
    return tier;
  }
  return null;
}

export function getEarnedBadgeTiers(
  stats: Pick<ProfileData, "accuracyPct" | "marketsParticipated">,
  apiBadges?: ApiBadge[]
): BadgeTier[] {
  const explicitBadges = (apiBadges ?? [])
    .map(normalizeBadgeTier)
    .filter((badge): badge is BadgeTier => badge !== null);

  if (explicitBadges.length > 0) {
    const explicitSet = new Set(explicitBadges);
    return [...BADGE_TIERS]
      .reverse()
      .map((badge) => badge.tier)
      .filter((tier) => explicitSet.has(tier));
  }

  return [...BADGE_TIERS]
    .reverse()
    .filter(
      ({ minMarkets, minAccuracy }) =>
        stats.marketsParticipated >= minMarkets && stats.accuracyPct >= minAccuracy
    )
    .map(({ tier }) => tier);
}

function normalizeActivity(activity: any, index: number): ProfileActivity {
  return {
    id: String(activity?.id ?? activity?.bet_id ?? activity?.betId ?? index),
    marketQuestion:
      activity?.market_question ??
      activity?.marketQuestion ??
      activity?.question ??
      "Untitled market",
    outcomeName: activity?.outcome_name ?? activity?.outcomeName ?? "Position placed",
    amount: toNumber(activity?.amount ?? activity?.stake ?? 0),
    createdAt: activity?.created_at ?? activity?.createdAt ?? new Date(0).toISOString(),
    result: activity?.result ?? activity?.status ?? null,
  };
}

export function normalizeProfileResponse(data: any, routeAddress: string): ProfileData {
  const accuracyPct = toNumber(data?.accuracy_pct ?? data?.accuracyPct);
  const marketsParticipated = toNumber(
    data?.total_markets_participated ?? data?.markets_count ?? data?.marketsParticipated
  );
  const totalVolumeXlm = toNumber(
    data?.total_volume_xlm ?? data?.totalVolumeXlm ?? data?.total_volume
  );
  const netPnlXlm = toNumber(data?.net_pnl_xlm ?? data?.net_pnl ?? data?.netPnlXlm);
  const winCount = toNumber(data?.win_count ?? data?.wins ?? data?.winCount);
  const lossCount = toNumber(data?.loss_count ?? data?.losses ?? data?.lossCount);

  return {
    address: data?.address ?? routeAddress,
    displayName: data?.display_name ?? data?.displayName ?? null,
    accuracyPct,
    marketsParticipated,
    totalVolumeXlm,
    netPnlXlm,
    winCount,
    lossCount,
    badges: getEarnedBadgeTiers(
      { accuracyPct, marketsParticipated },
      data?.badges ?? data?.reputation_badges
    ),
    recentActivity: Array.isArray(data?.recent_activity)
      ? data.recent_activity.slice(0, 5).map(normalizeActivity)
      : Array.isArray(data?.recentBets)
      ? data.recentBets.slice(0, 5).map(normalizeActivity)
      : [],
  };
}

export function isOwnProfileAddress(publicKey: string | null, address: string): boolean {
  return !!publicKey && publicKey.toUpperCase() === address.toUpperCase();
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatXlm(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} XLM`;
}

function formatSignedXlm(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatXlm(value)}`;
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function StatCard({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export default function ProfileByAddressPage() {
  const params = useParams<{ address: string }>();
  const routeAddress = typeof params?.address === "string" ? params.address : "";
  const { publicKey } = useWalletContext();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const isOwnProfile = useMemo(
    () => isOwnProfileAddress(publicKey, routeAddress),
    [publicKey, routeAddress]
  );

  useEffect(() => {
    if (!routeAddress || !validateStellarAddress(routeAddress)) {
      setProfile(null);
      setIsLoading(false);
      setError("Invalid Stellar wallet address.");
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setIsLoading(true);
      setError(null);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
        const response = await fetch(
          `${apiUrl}/api/leaderboard/profile/${encodeURIComponent(routeAddress)}`
        );

        if (!response.ok) {
          throw new Error("Failed to load profile.");
        }

        const data = await response.json();
        if (cancelled) return;

        setProfile(normalizeProfileResponse(data, routeAddress));
      } catch (err) {
        if (!cancelled) {
          setProfile(null);
          setError(err instanceof Error ? err.message : "Failed to load profile.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [routeAddress]);

  async function handleShareProfile() {
    if (typeof window === "undefined") return;

    const profileUrl = `${window.location.origin}/profile/${routeAddress}`;
    await navigator.clipboard.writeText(profileUrl);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="h-40 animate-pulse rounded-3xl border border-gray-800 bg-gray-900" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border border-gray-800 bg-gray-900"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-3xl border border-gray-800 bg-gray-900" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-900/60 bg-red-950/20 p-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Profile unavailable</h1>
          <p className="mt-3 text-sm text-red-200/80">{error ?? "This profile could not be loaded."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/50">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex justify-center sm:block">
                  {profile.badges.length > 0 ? (
                    <ReputationBadgeWithLabel
                      tier={profile.badges[profile.badges.length - 1]}
                      size={96}
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-gray-700 bg-gray-900/80">
                      <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        New
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-indigo-300">
                      Public Profile
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold text-white">
                      {profile.displayName || abbreviateAddress(profile.address)}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <CopyButton
                      value={profile.address}
                      displayValue={abbreviateAddress(profile.address)}
                      label="Copy wallet address"
                    />
                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="inline-flex items-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:border-indigo-400 hover:bg-indigo-500/20"
                    >
                      {shareCopied ? "Profile Link Copied" : "Share Profile"}
                    </button>
                    {isOwnProfile ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800"
                      >
                        Edit Display Name
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Win / Loss Record
                </p>
                <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
                  {profile.winCount}W <span className="text-gray-500">/</span> {profile.lossCount}L
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Reputation Badges
              </h2>
              {profile.badges.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-4">
                  {profile.badges.map((badge) => (
                    <div
                      key={badge}
                      className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3"
                    >
                      <ReputationBadgeWithLabel tier={badge} size={48} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-400">
                  No reputation badges earned yet. More settled predictions unlock new tiers.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Accuracy" value={formatPercentage(profile.accuracyPct)} tone="text-green-400" />
          <StatCard
            label="Markets"
            value={formatCompactNumber(profile.marketsParticipated)}
          />
          <StatCard label="Total Volume" value={formatXlm(profile.totalVolumeXlm)} />
          <StatCard
            label="Net P&L"
            value={formatSignedXlm(profile.netPnlXlm)}
            tone={profile.netPnlXlm >= 0 ? "text-green-400" : "text-red-400"}
          />
          <StatCard
            label="Record"
            value={`${profile.winCount}-${profile.lossCount}`}
            tone="text-indigo-300"
          />
        </section>

        <section className="rounded-3xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
              <p className="mt-1 text-sm text-gray-400">Last 5 bets placed on Stellar Polymarket.</p>
            </div>
          </div>

          {profile.recentActivity.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-700 bg-gray-950/60 p-6 text-sm text-gray-400">
              No recent bets found for this profile yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {profile.recentActivity.map((activity) => (
                <article
                  key={activity.id}
                  className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-medium text-white">{activity.marketQuestion}</p>
                      <p className="mt-2 text-sm text-gray-400">
                        {activity.outcomeName} · {formatXlm(activity.amount)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      {activity.result ? (
                        <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">
                          {activity.result}
                        </span>
                      ) : null}
                      <time className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        {formatActivityTime(activity.createdAt)}
                      </time>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
