import { useMemo, useState, useEffect } from "react";
import type { Market } from "../types/market";

export type TabKey = "active" | "resolved" | "watchlist";

const STORAGE_KEY = "marketListActiveTab";

export interface MarketTabsResult {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  activeMarkets: Market[];
  resolvedMarkets: Market[];
  watchlistMarkets: Market[];
  activeBadge: number;
  resolvedBadge: number;
  watchlistBadge: number;
}

export function useMarketTabs(markets: Market[], watchlist?: Set<number>): MarketTabsResult {
  const [activeTab, setActiveTabState] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "active";
    return (localStorage.getItem(STORAGE_KEY) as TabKey) ?? "active";
  });

  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, tab);
    }
  };

  const activeMarkets = useMemo(
    () =>
      markets
        .filter((m) => !m.resolved && new Date(m.end_date) > new Date())
        .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime()),
    [markets]
  );

  const resolvedMarkets = useMemo(
    () =>
      markets
        .filter((m) => m.resolved)
        .sort((a, b) => {
          const aDate = a.finalized_at ?? a.end_date;
          const bDate = b.finalized_at ?? b.end_date;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }),
    [markets]
  );

  const watchlistMarkets = useMemo(
    () =>
      watchlist && watchlist.size > 0
        ? markets
            .filter((m) => watchlist.has(m.id))
            .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())
        : [],
    [markets, watchlist]
  );

  return {
    activeTab,
    setActiveTab,
    activeMarkets,
    resolvedMarkets,
    watchlistMarkets,
    activeBadge: activeMarkets.length,
    resolvedBadge: resolvedMarkets.length,
    watchlistBadge: watchlistMarkets.length,
  };
}
