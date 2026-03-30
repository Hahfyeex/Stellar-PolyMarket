import { useEffect, useState } from "react";
import { normalizeReferralStats, type ReferralStats } from "../lib/referral";

interface UseReferralStatsResult {
  stats: ReferralStats;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_STATS: ReferralStats = {
  referredUsers: 0,
  totalBonusEarned: 0,
};

export function useReferralStats(walletAddress: string | null): UseReferralStatsResult {
  const [stats, setStats] = useState<ReferralStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setStats(EMPTY_STATS);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetchReferralStats() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/users/${walletAddress}/stats`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!cancelled) {
          setStats(normalizeReferralStats(data));
        }
      } catch (err) {
        if (!cancelled) {
          setStats(EMPTY_STATS);
          setError(err instanceof Error ? err.message : "Failed to load referral stats.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchReferralStats();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return { stats, isLoading, error };
}
