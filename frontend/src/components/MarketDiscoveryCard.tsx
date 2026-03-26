"use client";
/**
 * MarketDiscoveryCard
 *
 * Visually rich card for the market discovery feed.
 * Shows category SVG illustration, question, pool size, end date,
 * category tag, and a "Hot" badge when trending.
 *
 * Hover effect (desktop only):
 *   translateY(-4px) + elevated box-shadow via CSS class.
 *   The effect is suppressed on touch devices via @media (hover: hover)
 *   so it doesn't fire on mobile scroll.
 */
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { ScoredMarket, MarketCategory } from "../utils/marketDiscovery";

const CATEGORY_META: Record<MarketCategory, { color: string; bg: string; border: string }> = {
  Sports:   { color: "text-blue-400",   bg: "bg-blue-900/30",   border: "border-blue-700/50" },
  Crypto:   { color: "text-purple-400", bg: "bg-purple-900/30", border: "border-purple-700/50" },
  Finance:  { color: "text-green-400",  bg: "bg-green-900/30",  border: "border-green-700/50" },
  Politics: { color: "text-red-400",    bg: "bg-red-900/30",    border: "border-red-700/50" },
  Weather:  { color: "text-cyan-400",   bg: "bg-cyan-900/30",   border: "border-cyan-700/50" },
};

interface Props {
  market: ScoredMarket;
  onClick?: (market: ScoredMarket) => void;
}

export default function MarketDiscoveryCard({ market, onClick }: Props) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[market.category];
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(market.end_date).getTime() - Date.now()) / 86_400_000)
  );
  const poolDisplay = parseFloat(market.total_pool).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  return (
    <article
      data-testid="discovery-card"
      onClick={() => onClick?.(market)}
      className="
        group relative bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden
        cursor-pointer select-none
        transition-all duration-200 ease-out
        hover-lift
      "
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Hot badge */}
      {market.isHot && (
        <div
          data-testid="hot-badge"
          className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg"
        >
          🔥 {t("discovery.hot")}
        </div>
      )}

      {/* Category illustration */}
      <div className={`relative h-28 flex items-center justify-center ${meta.bg} border-b ${meta.border}`}>
        <Image
          src={`/categories/${market.category.toLowerCase()}.svg`}
          alt={t("discovery.categoryAlt", { category: market.category })}
          width={72}
          height={72}
          className="drop-shadow-lg"
          priority={false}
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        {/* Category tag */}
        <span className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
          {market.category}
        </span>

        {/* Question */}
        <p className="text-white text-sm font-medium leading-snug line-clamp-2">
          {market.question}
        </p>

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          <span className="flex items-center gap-1">
            {/* Pool icon */}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-blue-400">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 1" />
            </svg>
            <span className="text-white font-medium">{poolDisplay} XLM</span>
          </span>

          <span className="flex items-center gap-1">
            {/* Calendar icon */}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path d="M5 1v3M11 1v3M2 7h12" />
            </svg>
            {daysLeft === 0 ? (
              <span className="text-red-400">{t("discovery.endsToday")}</span>
            ) : (
              <span>{t("discovery.daysLeft", { count: daysLeft })}</span>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
