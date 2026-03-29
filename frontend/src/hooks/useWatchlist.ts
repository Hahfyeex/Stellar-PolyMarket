/**
 * useWatchlist
 *
 * Manages a watchlist of market IDs stored in localStorage.
 * Provides add/remove operations and a checked state for UI bindings.
 *
 * localStorage key: "stella_watchlist"
 * Format: JSON stringified Set of market IDs (stored as JSON array)
 */
import { useState, useCallback } from "react";

const STORAGE_KEY = "stella_watchlist";

export interface UseWatchlistResult {
  /** Set of watched market IDs */
  watchlist: Set<number>;
  /** Add a market to the watchlist */
  addToWatchlist: (marketId: number) => void;
  /** Remove a market from the watchlist */
  removeFromWatchlist: (marketId: number) => void;
  /** Check if a market is in the watchlist */
  isWatched: (marketId: number) => boolean;
  /** Toggle a market in the watchlist */
  toggleWatchlist: (marketId: number) => void;
}

/**
 * Read watchlist from localStorage and return as a Set
 */
function readWatchlist(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed);
  } catch {
    // Corrupted data — treat as empty
    return new Set();
  }
}

/**
 * Write watchlist to localStorage from a Set
 */
function writeWatchlist(watchlist: Set<number>): void {
  if (typeof window === "undefined") return;
  try {
    const arr = Array.from(watchlist);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}

export function useWatchlist(): UseWatchlistResult {
  // Initialize from localStorage on first render
  const [watchlist, setWatchlistState] = useState<Set<number>>(() => {
    return readWatchlist();
  });

  const addToWatchlist = useCallback(
    (marketId: number) => {
      setWatchlistState((prev) => {
        const updated = new Set(prev);
        updated.add(marketId);
        writeWatchlist(updated);
        return updated;
      });
    },
    []
  );

  const removeFromWatchlist = useCallback(
    (marketId: number) => {
      setWatchlistState((prev) => {
        const updated = new Set(prev);
        updated.delete(marketId);
        writeWatchlist(updated);
        return updated;
      });
    },
    []
  );

  const isWatched = useCallback(
    (marketId: number) => {
      return watchlist.has(marketId);
    },
    [watchlist]
  );

  const toggleWatchlist = useCallback(
    (marketId: number) => {
      if (isWatched(marketId)) {
        removeFromWatchlist(marketId);
      } else {
        addToWatchlist(marketId);
      }
    },
    [isWatched, addToWatchlist, removeFromWatchlist]
  );

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isWatched,
    toggleWatchlist,
  };
}

export default useWatchlist;
