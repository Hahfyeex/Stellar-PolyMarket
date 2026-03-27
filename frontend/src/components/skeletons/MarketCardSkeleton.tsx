"use client";

import Skeleton from "../Skeleton";

/**
 * MarketCardSkeleton Component
 *
 * Matches the exact layout of MarketCard component to prevent layout shifts.
 * Displays a loading skeleton with:
 * - Title skeleton (spans 2 lines for long market questions)
 * - Status badge placeholder
 * - Pool info and end date skeleton
 * - Pool ownership chart placeholder
 * - Outcome buttons
 * - Bet input and button
 *
 * Dimensions must exactly match MarketCard to prevent CLS (Cumulative Layout Shift).
 */
export default function MarketCardSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800">
      {/* Title + Status Badge Row */}
      <div className="flex justify-between items-start gap-3">
        {/* Title skeleton - mimics the h3 element */}
        <div className="flex-1">
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-5 w-3/4" />
        </div>

        {/* Status badge placeholder */}
        <Skeleton className="h-5 w-16" />
      </div>

      {/* Pool info + End date skeleton */}
      <Skeleton className="h-5 w-2/3" />

      {/* Pool ownership chart placeholder - maintains the same height as the real chart */}
      <Skeleton className="h-32 w-full" />

      {/* Outcomes buttons grid - matches the 2 button layout */}
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Amount input + button row */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Message/feedback text area */}
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}
