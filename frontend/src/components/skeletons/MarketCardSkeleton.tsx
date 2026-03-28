"use client";

import Skeleton from "../Skeleton";

/**
 * MarketCardSkeleton
 *
 * Matches the exact layout of MarketCard to prevent CLS.
 * Exported as both default and named export for flexibility.
 */
export function MarketCardSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800">
      {/* Title + Status Badge Row */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        {/* Resolved badge placeholder */}
        <Skeleton className="h-5 w-16" />
      </div>

      {/* Pool info + End date */}
      <Skeleton className="h-5 w-2/3" />

      {/* View Details link */}
      <Skeleton className="h-4 w-24" />

      {/* Pool ownership chart */}
      <Skeleton className="h-32 w-full" />

      {/* Outcome buttons */}
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Amount input + Bet button */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Message/feedback */}
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

export default MarketCardSkeleton;
