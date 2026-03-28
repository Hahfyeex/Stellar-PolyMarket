"use client";

import Skeleton from "../Skeleton";

/**
 * MarketDetailSkeleton
 *
 * Two-column layout skeleton matching the market detail page (markets/[id]).
 * Left column (65%): chart + prices + bet history.
 * Right column (35%): trade panel.
 * Prevents CLS by matching exact dimensions of loaded content.
 */
export function MarketDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Hero: question + status */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Chart */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-72 w-full" />
          </div>

          {/* Outcome price tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-16 mx-auto" />
                <Skeleton className="h-3 w-12 mx-auto" />
              </div>
            ))}
          </div>

          {/* Bet history table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column — trade panel */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <Skeleton className="h-5 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 flex-1" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketDetailSkeleton;
