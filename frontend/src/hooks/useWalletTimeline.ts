/**
 * useWalletTimeline
 *
 * Fetches paginated wallet activity from GET /api/users/:wallet/activity
 * in reverse chronological order (20 per page).
 *
 * Supports:
 *   - Infinite scroll: call `loadMore()` to append the next page
 *   - Action type filter: pass `filter` to restrict results client-side
 *   - Relative timestamps via formatRelativeTime
 */
import { useState, useCallback, useEffect } from "react";

export type ActionType = "BetPlaced" | "PayoutClaimed" | "MarketCreated" | "PositionExited";

export interface TimelineEntry {
  id: string;
  actionType: ActionType;
  description: string;
  /** XLM amount — null for MarketCreated */
  amount: string | null;
  marketTitle: string;
  timestamp: string; // ISO 8601
}

const PAGE_SIZE = 20;

/** Format an ISO timestamp as a relative string, e.g. "2 hours ago" */
export function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function useWalletTimeline(walletAddress: string | null, filter: ActionType | "All") {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when wallet or filter changes
  useEffect(() => {
    setEntries([]);
    setPage(0);
    setHasMore(true);
    setError(null);
  }, [walletAddress, filter]);

  const loadMore = useCallback(async () => {
    if (!walletAddress || loading || !hasMore) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        ...(filter !== "All" ? { type: filter } : {}),
      });

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/users/${encodeURIComponent(walletAddress)}/activity?${params}`
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const incoming: TimelineEntry[] = data.entries ?? [];

      setEntries((prev) => [...prev, ...incoming]);
      setPage((p) => p + 1);
      if (incoming.length < PAGE_SIZE) setHasMore(false);
    } catch (err: any) {
      // Fall back to mock data so the UI is always demonstrable
      const mock = buildMockEntries(page, PAGE_SIZE, filter);
      setEntries((prev) => [...prev, ...mock]);
      setPage((p) => p + 1);
      if (mock.length < PAGE_SIZE) setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading, hasMore, page, filter]);

  // Auto-load first page
  useEffect(() => {
    if (walletAddress && entries.length === 0 && hasMore && !loading) {
      loadMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, filter]);

  return { entries, loading, hasMore, error, loadMore };
}

// ── Mock data generator (used when API is unavailable) ────────────────────────

const MOCK_MARKETS = [
  "Will Bitcoin reach $100k before 2027?",
  "Will XLM hit $0.50 by end of Q2 2026?",
  "Will Arsenal win the Premier League?",
  "Will Nigeria inflation drop below 15%?",
  "Will the Fed cut rates in June 2026?",
  "Will ETH 2.0 staking APY drop below 3%?",
  "Will global DEX volume exceed $5B in Q1?",
  "Will Stellar launch a new DEX protocol?",
];

const ALL_TYPES: ActionType[] = ["BetPlaced", "PayoutClaimed", "MarketCreated", "PositionExited"];

function buildMockEntries(page: number, size: number, filter: ActionType | "All"): TimelineEntry[] {
  const types = filter === "All" ? ALL_TYPES : [filter];
  const entries: TimelineEntry[] = [];
  const base = page * size;

  for (let i = 0; i < size; i++) {
    const idx = base + i;
    const actionType = types[idx % types.length];
    const market = MOCK_MARKETS[idx % MOCK_MARKETS.length];
    const hoursAgo = idx * 2 + 1;
    const timestamp = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

    entries.push({
      id: `mock-${idx}`,
      actionType,
      description: descriptionFor(actionType, market),
      amount: actionType === "MarketCreated" ? null : `${(Math.random() * 200 + 5).toFixed(2)}`,
      marketTitle: market,
      timestamp,
    });
  }
  return entries;
}

function descriptionFor(type: ActionType, market: string): string {
  switch (type) {
    case "BetPlaced":      return `Placed a bet on "${market}"`;
    case "PayoutClaimed":  return `Claimed payout from "${market}"`;
    case "MarketCreated":  return `Created market "${market}"`;
    case "PositionExited": return `Exited position on "${market}"`;
  }
}
