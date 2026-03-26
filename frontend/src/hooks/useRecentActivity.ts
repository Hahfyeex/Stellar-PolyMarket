import { useEffect, useRef, useState } from "react";

export interface ActivityItem {
  id: number;
  wallet_address: string;
  outcome_index: number;
  amount: string;
  created_at: string;
  question: string;
  outcomes: string[];
}

/** Format a wallet address for display: first 4 + last 3 chars (e.g. ABCD...XYZ) */
export function formatWallet(address: string): string {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

/** Format a UTC ISO timestamp to a human-readable relative string */
export function formatRelativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

/** Map a raw API row to a display-ready ActivityItem */
export function mapActivityItem(raw: ActivityItem): ActivityItem {
  return {
    ...raw,
    amount: parseFloat(raw.amount).toFixed(2),
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes : [],
  };
}

const POLL_INTERVAL_MS = 10_000; // Poll every 10 seconds per spec

export function useRecentActivity(apiUrl: string, limit = 20) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        // Fetch latest activity; falls back gracefully on non-2xx responses
        const res = await fetch(`${apiUrl}/api/activity/recent?limit=${limit}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const mapped: ActivityItem[] = (data.activity ?? []).map(mapActivityItem);
        // Diff against known IDs to identify truly new items for animation
        const incoming = new Set(mapped.map((i) => i.id));
        const fresh = new Set([...incoming].filter((id) => !knownIds.current.has(id)));

        knownIds.current = incoming;
        setItems(mapped);
        if (fresh.size > 0) setNewIds(fresh);
      } catch (err: any) {
        // On error, keep stale data visible; ticker will show demo fallback
        if (!cancelled) setError(err.message);
      }
    }

    poll(); // Immediate first fetch — no waiting for first interval
    // Re-poll every POLL_INTERVAL_MS; cleared on unmount to prevent memory leaks
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true; // Prevent setState on unmounted component
      clearInterval(timer);
    };
  }, [apiUrl, limit]);

  // Clear "new" highlight after animation completes
  useEffect(() => {
    if (newIds.size === 0) return;
    const t = setTimeout(() => setNewIds(new Set()), 1200);
    return () => clearTimeout(t);
  }, [newIds]);

  return { items, newIds, error };
}
