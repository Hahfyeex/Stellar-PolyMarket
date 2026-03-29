"use client";

import MarketCardSkeleton from "./MarketCardSkeleton";

/**
 * MarketListSkeleton
 *
 * Grid of 6 MarketCardSkeleton placeholders matching the markets list layout.
 * Prevents CLS by occupying the same space as the loaded grid.
 */
export function MarketListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default MarketListSkeleton;
