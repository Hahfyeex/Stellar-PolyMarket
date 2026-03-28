"use client";

import Skeleton from "../Skeleton";

/**
 * LeaderboardSkeleton
 *
 * Matches the leaderboard page layout:
 * - 3 summary stat cards
 * - Table with 10 placeholder rows (rank, predictor, markets, accuracy)
 * Prevents CLS by matching exact dimensions of loaded content.
 */
export function LeaderboardSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Summary stats — 3 cards */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center space-y-2">
            <Skeleton className="h-7 w-16 mx-auto" />
            <Skeleton className="h-3 w-24 mx-auto" />
          </div>
        ))}
      </div>

      {/* Table — 10 rows */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 w-12">
                <Skeleton className="h-3 w-8" />
              </th>
              <th className="px-4 py-3">
                <Skeleton className="h-3 w-20" />
              </th>
              <th className="px-4 py-3 text-right">
                <Skeleton className="h-3 w-16 ml-auto" />
              </th>
              <th className="px-4 py-3 text-right">
                <Skeleton className="h-3 w-16 ml-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className={i < 9 ? "border-b border-gray-800" : ""}>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-6" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="h-4 w-10 ml-auto" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="h-4 w-12 ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LeaderboardSkeleton;
