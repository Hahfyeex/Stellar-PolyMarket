"use client";

import Skeleton from "../Skeleton";

/**
 * MetricsSkeletons Component
 *
 * Matches the exact layout of LPMetricsOverview to prevent layout shifts.
 * Displays a grid of 4 metric cards in loading state.
 *
 * Each metric card contains:
 * - Icon placeholder (small rounded square)
 * - Label text
 * - Large value/number
 * - Subtext/status
 *
 * Uses the same grid layout as LPMetricsOverview (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
 * to maintain layout consistency.
 */
export default function MetricsSkeletons() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Render 4 metric card skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800"
        >
          {/* Icon placeholder */}
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>

          {/* Label */}
          <Skeleton className="h-3 w-40 mb-3" />

          {/* Main value - larger text */}
          <Skeleton className="h-8 w-32 mb-2" />

          {/* Subtext */}
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}
