import { useQuery } from "@tanstack/react-query";

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

const POLL_INTERVAL_MS = 10_000;

async function fetchActivity(apiUrl: string, limit: number): Promise<ActivityItem[]> {
  const res = await fetch(`${apiUrl}/api/activity/recent?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.activity ?? []).map(mapActivityItem);
}

export function useRecentActivity(apiUrl: string, limit = 20) {
  return useQuery<ActivityItem[], Error>({
    queryKey: ["recentActivity", apiUrl, limit],
    queryFn: () => fetchActivity(apiUrl, limit),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
