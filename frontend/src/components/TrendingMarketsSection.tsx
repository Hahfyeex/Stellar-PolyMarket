"use client";

import Link from "next/link";
import { useTrendingMarkets } from "../hooks/useTrendingMarkets";

export default function TrendingMarketsSection() {
  const { data: markets, isLoading, error } = useTrendingMarkets();

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🔥 Trending Markets
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-56 h-32 bg-gray-900 rounded-xl animate-pulse border border-gray-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !markets?.length) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          🔥 Trending Markets
        </h2>
        <Link
          href="/markets?sort=trending"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          See All Trending →
        </Link>
      </div>

      {/* Horizontal scroll with snap */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none" }}
        data-testid="trending-scroll-container"
      >
        {markets.slice(0, 6).map((market) => (
          <Link
            key={market.id}
            href={`/market/${market.id}`}
            className="flex-shrink-0 w-56 snap-start bg-gray-900 border border-gray-800 hover:border-blue-500/50 rounded-xl p-4 flex flex-col gap-2 transition-colors"
            data-testid={`trending-card-${market.id}`}
          >
            {/* Fire badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded-full px-2 py-0.5">
                🔥 Trending
              </span>
            </div>

            <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
              {market.question}
            </p>

            <div className="mt-auto text-xs text-gray-400">
              24h vol:{" "}
              <span className="text-white font-semibold">
                {parseFloat(market.volume_24h ?? "0").toFixed(0)} XLM
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
