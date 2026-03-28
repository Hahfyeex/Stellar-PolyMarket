"use client";
/**
 * LiveActivityFeed
 *
 * Polls GET /api/activity/recent every 10 s via React Query.
 * Pauses automatically when the tab is hidden (refetchIntervalInBackground: false).
 * New entries animate in from the top with Framer Motion.
 * List is capped at 20 entries; oldest entries are dropped from the bottom.
 * Wallet addresses are abbreviated: first 4 chars + "..." + last 3 chars.
 */
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  formatWallet,
  formatRelativeTime,
  mapActivityItem,
  ActivityItem,
} from "../hooks/useRecentActivity";
import ActivityFeedSkeleton from "./skeletons/ActivityFeedSkeleton";

const MAX_ENTRIES = 20;
const POLL_INTERVAL = 10_000;

// ── Demo fallback ─────────────────────────────────────────────────────────────

const DEMO_ACTIVITY: ActivityItem[] = [
  {
    id: 1,
    wallet_address: "GBXYZ1234ABCD",
    outcome_index: 0,
    amount: "150.00",
    created_at: new Date(Date.now() - 30000).toISOString(),
    question: "Will Bitcoin reach $100k before 2027?",
    outcomes: ["Yes", "No"],
  },
  {
    id: 2,
    wallet_address: "GCDEF5678EFGH",
    outcome_index: 1,
    amount: "75.50",
    created_at: new Date(Date.now() - 90000).toISOString(),
    question: "Will Arsenal win the Premier League?",
    outcomes: ["Yes", "No"],
  },
  {
    id: 3,
    wallet_address: "GABC9012IJKL",
    outcome_index: 0,
    amount: "200.00",
    created_at: new Date(Date.now() - 180000).toISOString(),
    question: "Will Nigeria inflation drop below 15%?",
    outcomes: ["Yes", "No"],
  },
];

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchRecentActivity(apiUrl: string): Promise<ActivityItem[]> {
  const res = await fetch(`${apiUrl}/api/activity/recent?limit=${MAX_ENTRIES}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.activity ?? []).map(mapActivityItem).slice(0, MAX_ENTRIES);
}

// ── Animation variants ────────────────────────────────────────────────────────

export const itemVariants = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  apiUrl?: string;
}

export default function LiveActivityFeed({ apiUrl }: Props) {
  const url = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const prevIdsRef = useRef<Set<number>>(new Set());

  const { data, isLoading, isError } = useQuery<ActivityItem[]>({
    queryKey: ["recentActivity", url],
    queryFn: () => fetchRecentActivity(url),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  if (isLoading) return <ActivityFeedSkeleton count={3} />;

  const items = isError || !data || data.length === 0 ? DEMO_ACTIVITY : data;

  // Determine which IDs are new since the last render
  const newIds = new Set(items.map((i) => i.id).filter((id) => !prevIdsRef.current.has(id)));
  prevIdsRef.current = new Set(items.map((i) => i.id));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <h2 className="text-sm font-semibold text-white">Live Activity</h2>
        {(isError || !data || data.length === 0) && (
          <span className="ml-auto text-xs text-gray-500">demo data</span>
        )}
      </div>

      {/* Feed */}
      <ul className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const outcome = item.outcomes[item.outcome_index] ?? `Outcome ${item.outcome_index}`;
            return (
              <motion.li
                key={item.id}
                variants={itemVariants}
                initial={newIds.has(item.id) ? "initial" : false}
                animate="animate"
                exit="exit"
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 truncate">{item.question}</p>
                  <p className="text-sm text-white mt-0.5">
                    <span className="font-mono text-blue-400">
                      {formatWallet(item.wallet_address)}
                    </span>
                    {" bet "}
                    <span className="font-semibold text-white">{item.amount} XLM</span>
                    {" on "}
                    <span className="text-green-400 font-medium">{outcome}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                  {formatRelativeTime(item.created_at)}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
