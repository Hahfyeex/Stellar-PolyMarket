import React from 'react';

interface Props {
  poolDepth: Record<string, number>;
  totalPool: number;
  outcomeIndex: number;
}

export default function LiquidityHeatmap({ poolDepth, totalPool, outcomeIndex }: Props) {
  // Depth-to-opacity mapping logic:
  // 1. Get the pool size for this specific outcome.
  // 2. If the total pool is 0, opacity is 0 (empty pool).
  // 3. Otherwise, opacity is the percentage of this outcome's pool relative to the total pool.
  const outcomePool = poolDepth[outcomeIndex] || 0;
  const opacity = totalPool > 0 ? outcomePool / totalPool : 0;

  // Blue for YES (index 0), Orange for NO (index 1), fallback to gray for others
  let bgColorClass = "bg-gray-500";
  if (outcomeIndex === 0) {
    bgColorClass = "bg-blue-500";
  } else if (outcomeIndex === 1) {
    bgColorClass = "bg-orange-500";
  }

  return (
    <div
      data-testid={`heatmap-overlay-${outcomeIndex}`}
      className={`absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300 ${bgColorClass}`}
      style={{ opacity: opacity * 0.4 }} // Max 40% opacity so text remains readable
    />
  );
}
