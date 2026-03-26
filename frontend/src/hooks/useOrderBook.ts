/**
 * useOrderBook
 *
 * Fetches and live-polls the bet history for a single market.
 * Returns the initial page of rows plus a loadMore function for infinite scroll.
 *
 * Live update strategy:
 *   - Polls every POLL_MS for new bets (prepends to front of list)
 *   - New rows are identified by id; duplicates are filtered out
 *
 * Pagination:
 *   - loadMore(page) fetches page N and returns the rows for appending
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { OrderBookRow } from "../components/VirtualizedOrderBook";

const POLL_MS = 5000;
const PAGE_SIZE = 50;

export function useOrderBook(apiUrl: string, marketId: number) {
  const [rows, setRows] = useState<OrderBookRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<number>>(new Set());

  async function fetchPage(page: number): Promise<OrderBookRow[]> {
    const res = await fetch(
      `${apiUrl}/api/markets/${marketId}/bets?page=${page}&limit=${PAGE_SIZE}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.bets ?? []) as OrderBookRow[];
  }

  // Initial load + live polling for new rows
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const fresh = await fetchPage(1);
        if (cancelled) return;
        const newRows = fresh.filter((r) => !knownIds.current.has(r.id));
        if (newRows.length > 0) {
          newRows.forEach((r) => knownIds.current.add(r.id));
          // Prepend new rows so latest bets appear at the top
          setRows((prev) => [...newRows, ...prev]);
        }
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, marketId]);

  /** Called by VirtualizedOrderBook's infinite scroll handler */
  const loadMore = useCallback(async (page: number): Promise<OrderBookRow[]> => {
    const pageRows = await fetchPage(page);
    const newRows = pageRows.filter((r) => !knownIds.current.has(r.id));
    newRows.forEach((r) => knownIds.current.add(r.id));
    return newRows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, marketId]);

  return { rows, error, loadMore };
}
