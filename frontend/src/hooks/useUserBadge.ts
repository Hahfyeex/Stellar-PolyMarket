import { useEffect, useState } from "react";
import { useWalletContext } from "../context/WalletContext";
import { getBadgeTier, type BadgeTier } from "../utils/badgeTier";

export interface UserStats {
  marketsCount: number;
  accuracyPct: number;
}

export interface UseUserBadgeResult {
  tier: BadgeTier | null;
  stats: UserStats | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches the connected user's prediction stats from the API and computes
 * their reputation badge tier via getBadgeTier.
 *
 * Returns null tier when:
 *   - No wallet is connected
 *   - User has not yet met any tier threshold
 *   - API request fails (error state is set separately)
 */
export function useUserBadge(): UseUserBadgeResult {
  const { publicKey } = useWalletContext();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setStats(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetchStats() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/users/${publicKey}/stats`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setStats({
          marketsCount: data.markets_count ?? 0,
          accuracyPct: data.accuracy_pct ?? 0,
        });
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const tier = stats ? getBadgeTier(stats.marketsCount, stats.accuracyPct) : null;

  return { tier, stats, isLoading, error };
}
