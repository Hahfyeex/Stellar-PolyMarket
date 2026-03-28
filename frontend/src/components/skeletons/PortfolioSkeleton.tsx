"use client";

import Skeleton from "../Skeleton";

/**
 * PortfolioSkeleton
 *
 * Matches the profile page portfolio layout:
 * - 4 summary stat cards (2×2 grid)
 * - Table with 5 placeholder rows for recent activity
 * Prevents CLS by matching exact dimensions of loaded content.
 */
export function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Profile card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row gap-6">
        <Skeleton className="h-24 w-24 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <Skeleton className="h-8 w-12 mx-auto mb-1" />
              <Skeleton className="h-3 w-24 mx-auto" />
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <Skeleton className="h-8 w-16 mx-auto mb-1" />
              <Skeleton className="h-3 w-28 mx-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio summary — 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>

      {/* Recent activity table — 5 rows */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-4 gap-4 ${
              i < 4 ? "border-b border-gray-800" : ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortfolioSkeleton;
