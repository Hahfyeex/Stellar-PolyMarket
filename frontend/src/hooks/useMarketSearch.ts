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
  category: string;
  status: string;
  sort: SortKey;
}

// Fuse.js instance is recreated only when the markets array reference changes.
// threshold: 0.4 — allows partial and slightly misspelled matches without too
// many false positives. Lower = stricter, higher = more lenient.
function createFuse(markets: Market[]) {
  return new Fuse(markets, {
    keys: [
      // "question" weighted higher so title matches rank above category matches
      { name: "question", weight: 0.8 },
      { name: "category", weight: 0.2 },
    ],
    threshold: 0.4, // 0 = exact, 1 = match anything
    includeScore: true, // lets Fuse return relevance scores for ordering
    minMatchCharLength: 2,
  });
}

function applySort(markets: Market[], sort: SortKey): Market[] {
  const copy = [...markets];
  if (sort === "volume") {
    // Highest total_pool first
    return copy.sort((a, b) => parseFloat(b.total_pool) - parseFloat(a.total_pool));
  }
  if (sort === "end_date") {
    // Soonest end date first
    return copy.sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
  }
  // newest: most recently created first (fall back to id desc if no created_at)
  return copy.sort((a, b) => {
    if (a.created_at && b.created_at) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return b.id - a.id;
  });
}

export function useMarketSearch(markets: Market[], filters: SearchFilters): Market[] {
  // Memoize the Fuse instance — only rebuilt when markets array changes
  const fuse = useMemo(() => createFuse(markets), [markets]);

  return useMemo(() => {
    let results = markets;

    // 1. Fuzzy search — only run when there's a non-empty query
    if (filters.query.trim().length >= 2) {
      results = fuse.search(filters.query).map((r) => r.item);
    }

    // 2. Category filter
    if (filters.category) {
      results = results.filter(
        (m) => (m.category ?? "").toLowerCase() === filters.category.toLowerCase()
      );
    }

    // 3. Status filter
    if (filters.status) {
      results = results.filter((m) => m.status === filters.status);
    }

    // 4. Sort (skip when fuzzy search is active — Fuse score order is more relevant)
    if (!filters.query.trim()) {
      results = applySort(results, filters.sort);
    }

    return results;
  }, [fuse, markets, filters]);
}

// Pure helpers exported for unit testing
export { applySort, createFuse };
