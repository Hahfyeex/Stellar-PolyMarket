"use client";
import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

async function fetchRecentActivity(apiUrl: string): Promise<ActivityItem[]> {
  const res = await fetch(`${apiUrl}/api/activity/recent?limit=${MAX_ENTRIES}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.activity ?? []).map(mapActivityItem).slice(0, MAX_ENTRIES);
}

export const itemVariants = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

interface Props {
  apiUrl?: string;
}

export default function LiveActivityFeed({ apiUrl }: Props) {
  const url = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const prevIdsRef = useRef<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<ActivityItem[]>({
    queryKey: ["recentActivity", url],
    queryFn: () => fetchRecentActivity(url),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  if (isLoading) return <ActivityFeedSkeleton count={3} />;

  if (isError) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <h2 className="text-sm font-semibold text-white">Live Activity</h2>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 px-5 py-8 text-center">
          <p className="text-sm text-gray-400">
            Unable to load recent activity. Check your connection.
          </p>
          <button
            onClick={() => queryClient.refetchQueries({ queryKey: ["recentActivity", url] })}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <h2 className="text-sm font-semibold text-white">Live Activity</h2>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">No activity yet. Be the first to place a bet!</p>
        </div>
      </div>
    );
  }

  const newIds = new Set(data.map((i) => i.id).filter((id) => !prevIdsRef.current.has(id)));
  prevIdsRef.current = new Set(data.map((i) => i.id));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <h2 className="text-sm font-semibold text-white">Live Activity</h2>
      </div>

      <ul className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
        <AnimatePresence initial={false}>
          {data.map((item) => {
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
