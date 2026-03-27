"use client";
/**
 * WalletActivityTimeline
 *
 * Full timeline component for the profile page.
 *
 * Features:
 *   - Filter dropdown (All / Bet Placed / Payout Claimed / Market Created / Position Exited)
 *   - Infinite scroll via IntersectionObserver — loads next 20 entries when
 *     the sentinel div scrolls into view
 *   - Reverse chronological order (newest first)
 *   - Relative timestamps (e.g. "2 hours ago")
 *   - Skeleton loaders while fetching
 */
import { useEffect, useRef, useState } from "react";
import { useWalletTimeline, ActionType } from "../../hooks/useWalletTimeline";
import TimelineEntry from "./TimelineEntry";

const FILTER_OPTIONS: { value: ActionType | "All"; label: string }[] = [
  { value: "All",            label: "All Activity" },
  { value: "BetPlaced",      label: "Bets Placed" },
  { value: "PayoutClaimed",  label: "Payouts Claimed" },
  { value: "MarketCreated",  label: "Markets Created" },
  { value: "PositionExited", label: "Positions Exited" },
];

interface Props {
  walletAddress: string | null;
}

export default function WalletActivityTimeline({ walletAddress }: Props) {
  const [filter, setFilter] = useState<ActionType | "All">("All");
  const { entries, loading, hasMore, loadMore } = useWalletTimeline(walletAddress, filter);

  // Sentinel ref for IntersectionObserver — triggers loadMore when visible
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" } // trigger 200px before the bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <section data-testid="wallet-activity-timeline">
      {/* Header + filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider">
          Activity Timeline
        </h2>

        {/* Filter dropdown */}
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActionType | "All")}
            aria-label="Filter activity type"
            className="appearance-none bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg pl-3 pr-8 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Chevron */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3 h-3 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Timeline list */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-800/60">
        {entries.length === 0 && !loading && (
          <div className="px-4 py-10 text-center text-gray-500 text-sm">
            No activity found{filter !== "All" ? ` for "${FILTER_OPTIONS.find(o => o.value === filter)?.label}"` : ""}.
          </div>
        )}

        {entries.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} />
        ))}

        {/* Skeleton loaders */}
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`skel-${i}`} className="flex items-start gap-4 py-4 px-4 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-800 shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-3 bg-gray-800 rounded w-24" />
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-2.5 bg-gray-800 rounded w-1/2" />
              </div>
            </div>
          ))}

        {/* End of list */}
        {!hasMore && entries.length > 0 && (
          <div className="px-4 py-4 text-center text-gray-600 text-xs">
            You've reached the beginning of your activity.
          </div>
        )}
      </div>

      {/* Invisible sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </section>
  );
}
