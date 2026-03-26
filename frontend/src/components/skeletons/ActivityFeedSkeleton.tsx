"use client";

import Skeleton from "../Skeleton";

/**
 * ActivityFeedSkeleton Component
 *
 * Matches the exact layout of LiveActivityFeed rows to prevent layout shifts.
 * Displays a loading skeleton for the activity feed with multiple rows.
 *
 * Each row contains:
 * - Question text (single line, truncated)
 * - Outcome text (single line)
 * - Amount text
 * - Time text
 * - Right-aligned outcome badge
 *
 * Dimensions and spacing must exactly match LiveActivityFeed to prevent CLS.
 */
interface Props {
  /**
   * Number of skeleton rows to display
   * Default: 3 (shows 3 loading rows)
   */
  count?: number;
}

export default function ActivityFeedSkeleton({ count = 3 }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        {/* Live indicator dot */}
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        {/* Header text */}
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Feed rows */}
      <ul className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
        {Array.from({ length: count }).map((_, i) => (
          <li key={i} className="px-5 py-3 flex items-center justify-between gap-3">
            {/* Left side: question, outcome, amount, time */}
            <div className="min-w-0 flex-1">
              {/* Question text */}
              <Skeleton className="h-3 w-full mb-1.5" />
              {/* Outcome + amount + time */}
              <div className="flex gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>

            {/* Right side: outcome badge */}
            <Skeleton className="h-5 w-16 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
