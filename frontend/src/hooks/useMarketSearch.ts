import { useMemo } from "react";
import Fuse from "fuse.js";

export interface Market {
  id: number;
  question: string;
  category?: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status: string;
  created_at?: string;
}

export type SortKey = "volume" | "end_date" | "newest";

export interface SearchFilters {
  query: string;
  /** Single category (legacy — kept for backward compat with existing URL param) */
  category: string;
  /** Multi-select categories for chip filter; empty array = no filter */
  categories: string[];
  status: string;
  sort: SortKey;
}

function createFuse(markets: Market[]) {
  return new Fuse(markets, {
    keys: [
      { name: "question", weight: 0.8 },
      { name: "category", weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

function applySort(markets: Market[], sort: SortKey): Market[] {
  const copy = [...markets];
  if (sort === "volume") {
    return copy.sort((a, b) => parseFloat(b.total_pool) - parseFloat(a.total_pool));
  }
  if (sort === "end_date") {
    return copy.sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
  }
  return copy.sort((a, b) => {
    if (a.created_at && b.created_at) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return b.id - a.id;
  });
}

/**
 * Filter markets by a set of active categories (AND logic within the list).
 * A market matches if its category is included in the active set.
 * If activeCategories is empty, all markets pass.
 */
export function filterByCategories(markets: Market[], activeCategories: string[]): Market[] {
  if (activeCategories.length === 0) return markets;
  const lower = activeCategories.map((c) => c.toLowerCase());
  return markets.filter((m) => lower.includes((m.category ?? "").toLowerCase()));
}

export function useMarketSearch(markets: Market[], filters: SearchFilters): Market[] {
  const fuse = useMemo(() => createFuse(markets), [markets]);

  return useMemo(() => {
    let results = markets;

    // 1. Fuzzy search
    if (filters.query.trim().length >= 2) {
      results = fuse.search(filters.query).map((r) => r.item);
    }

    // 2. Multi-select category chips (takes precedence over legacy single category)
    if (filters.categories.length > 0) {
      results = filterByCategories(results, filters.categories);
    } else if (filters.category) {
      // Legacy single-category fallback
      results = results.filter(
        (m) => (m.category ?? "").toLowerCase() === filters.category.toLowerCase()
      );
    }

    // 3. Status filter
    if (filters.status) {
      results = results.filter((m) => m.status === filters.status);
    }

    // 4. Sort
    if (!filters.query.trim()) {
      results = applySort(results, filters.sort);
    }

    return results;
  }, [fuse, markets, filters]);
}

export { applySort, createFuse };
