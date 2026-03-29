"use client";
import { useTranslation } from "react-i18next";
import type { TabKey } from "../hooks/useMarketTabs";

interface Props {
  activeTab: TabKey;
  activeBadge: number;
  resolvedBadge: number;
  watchlistBadge: number;
  onChange: (tab: TabKey) => void;
}

export default function MarketTabs({
  activeTab,
  activeBadge,
  resolvedBadge,
  watchlistBadge,
  onChange,
}: Props) {
  const { t } = useTranslation("common");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "active", label: t("markets.tabs.active"), count: activeBadge },
    { key: "watchlist", label: t("markets.tabs.watchlist"), count: watchlistBadge },
    { key: "resolved", label: t("markets.tabs.resolved"), count: resolvedBadge },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("markets.tabs.aria_label")}
      className="flex gap-1 mb-6 border-b border-[var(--border-default)] overflow-x-auto"
    >
      {tabs.map(({ key, label, count }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${key}`}
            id={`tab-${key}`}
            onClick={() => onChange(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              isActive
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
            <span
              className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
