"use client";
/**
 * VirtualizedOrderBook
 *
 * Renders a market's bet history as a virtualized list using react-window
 * FixedSizeList. Handles 500+ rows without frame drops by only mounting
 * the ~8 visible rows at any time.
 *
 * Virtualization config:
 *   itemSize = 48px  — fixed row height; required by FixedSizeList for O(1) scroll math
 *   height   = 400px — visible viewport; ~8 rows visible at once
 *   width    = "100%" — fills container
 *
 * Live update strategy:
 *   - Row data is held in a useRef (dataRef) so appending new rows never
 *     triggers a full list re-render.
 *   - After appending, listRef.current.resetAfterIndex(0) tells react-window
 *     to re-measure from the top without unmounting existing rows.
 *
 * Infinite scroll:
 *   - onItemsRendered fires whenever the visible window changes.
 *   - When visibleStopIndex >= itemCount - PREFETCH_THRESHOLD we fetch the
 *     next page and append to dataRef.
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { FixedSizeList, ListChildComponentProps, ListOnItemsRenderedProps } from "react-window";
import { formatWallet, formatRelativeTime } from "../hooks/useRecentActivity";

/** Height of each row in pixels — must be fixed for FixedSizeList */
export const ITEM_SIZE = 48;

/** Height of the visible scrolling window in pixels */
export const LIST_HEIGHT = 400;

/** Fetch next page when this many rows remain before the end */
const PREFETCH_THRESHOLD = 10;

export interface OrderBookRow {
  id: number;
  wallet_address: string;
  outcome_index: number;
  outcome_name: string;
  amount: string;
  created_at: string;
}

interface Props {
  marketId: number;
  outcomes: string[];
  /** Initial rows (first page) */
  initialRows?: OrderBookRow[];
  /** Called when the user scrolls near the bottom; should return the next page */
  onLoadMore?: (page: number) => Promise<OrderBookRow[]>;
}

/** Outcome badge colours cycle through a small palette */
const BADGE_COLORS = [
  "bg-blue-900/60 text-blue-300",
  "bg-green-900/60 text-green-300",
  "bg-purple-900/60 text-purple-300",
  "bg-yellow-900/60 text-yellow-300",
];

export default function VirtualizedOrderBook({
  marketId,
  outcomes,
  initialRows = [],
  onLoadMore,
}: Props) {
  // Hold rows in a ref so appends don't trigger a full re-render
  const dataRef = useRef<OrderBookRow[]>(initialRows);
  // itemCount drives react-window's scroll math — update this to trigger a repaint
  const [itemCount, setItemCount] = useState(initialRows.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);

  // react-window list ref — used to imperatively scroll if needed
  const listRef = useRef<FixedSizeList>(null);

  // Sync dataRef when initialRows prop changes (e.g. first API response arrives)
  useEffect(() => {
    dataRef.current = initialRows;
    setItemCount(initialRows.length);
    // FixedSizeList re-renders automatically when itemCount state changes;
    // no resetAfterIndex needed (that's a VariableSizeList API).
  }, [initialRows]);

  /**
   * Append new rows to the data ref without re-rendering existing rows.
   * Updating itemCount state triggers react-window to render the new rows
   * while existing rows keep their cached layout (fixed height = no remeasure).
   */
  const appendRows = useCallback((newRows: OrderBookRow[]) => {
    dataRef.current = [...dataRef.current, ...newRows];
    // Updating itemCount is sufficient — FixedSizeList recalculates scroll
    // height from itemCount * itemSize without touching existing rows.
    setItemCount(dataRef.current.length);
  }, []);

  /**
   * Infinite scroll handler — fires on every visible-window change.
   * Fetches the next page when the user is within PREFETCH_THRESHOLD rows of the end.
   */
  const handleItemsRendered = useCallback(
    async ({ visibleStopIndex }: ListOnItemsRenderedProps) => {
      if (!onLoadMore || loadingMore) return;
      if (visibleStopIndex >= dataRef.current.length - PREFETCH_THRESHOLD) {
        setLoadingMore(true);
        try {
          const nextPage = pageRef.current + 1;
          const rows = await onLoadMore(nextPage);
          if (rows.length > 0) {
            pageRef.current = nextPage;
            appendRows(rows);
          }
        } finally {
          setLoadingMore(false);
        }
      }
    },
    [onLoadMore, loadingMore, appendRows]
  );

  /** Row renderer — called by react-window for each visible row only */
  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = dataRef.current[index];
      if (!row) return null;

      const outcomeName = row.outcome_name || outcomes[row.outcome_index] || `#${row.outcome_index}`;
      const badgeColor = BADGE_COLORS[row.outcome_index % BADGE_COLORS.length];

      return (
        // style must be applied for react-window's absolute positioning to work
        <div
          style={style}
          data-testid={`order-row-${row.id}`}
          className="flex items-center gap-3 px-4 border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors"
        >
          {/* Abbreviated wallet address */}
          <span className="font-mono text-blue-400 text-xs w-20 shrink-0">
            {formatWallet(row.wallet_address)}
          </span>

          {/* Outcome badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badgeColor}`}>
            {outcomeName}
          </span>

          {/* XLM amount */}
          <span className="text-white text-sm font-semibold flex-1 text-right">
            {parseFloat(row.amount).toFixed(2)} XLM
          </span>

          {/* Relative timestamp */}
          <span className="text-gray-500 text-xs w-16 text-right shrink-0">
            {formatRelativeTime(row.created_at)}
          </span>
        </div>
      );
    },
    // outcomes is stable; dataRef.current is accessed by ref so no dep needed
    [outcomes]
  );

  if (itemCount === 0) {
    return (
      <div
        data-testid="order-book-empty"
        className="flex items-center justify-center h-24 text-gray-500 text-sm"
      >
        No bets yet
      </div>
    );
  }

  return (
    <div data-testid="virtualized-order-book" className="rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/60 text-xs text-gray-400 font-medium">
        <span className="w-20 shrink-0">Wallet</span>
        <span className="shrink-0">Outcome</span>
        <span className="flex-1 text-right">Amount</span>
        <span className="w-16 text-right shrink-0">Time</span>
      </div>

      {/*
       * FixedSizeList — the core virtualization primitive.
       * Only renders rows within the visible height window.
       * itemSize must match the actual row height (ITEM_SIZE px).
       */}
      <FixedSizeList
        ref={listRef}
        height={LIST_HEIGHT}
        width="100%"
        itemCount={itemCount}
        itemSize={ITEM_SIZE}
        onItemsRendered={handleItemsRendered}
        data-testid="order-book-list"
      >
        {Row}
      </FixedSizeList>

      {/* Loading indicator shown while fetching next page */}
      {loadingMore && (
        <div
          data-testid="order-book-loading"
          className="flex items-center justify-center py-2 text-xs text-gray-500"
        >
          Loading more…
        </div>
      )}
    </div>
  );
}
