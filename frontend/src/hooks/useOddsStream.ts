"use client";
/**
 * useOddsStream — live per-outcome odds via Mercury Indexer WebSocket
 *
 * Connection management
 * ─────────────────────
 * A single WebSocket is opened per marketId against the Mercury Indexer endpoint
 * (`NEXT_PUBLIC_MERCURY_WS_URL`). On disconnect the hook automatically schedules
 * a reconnect using exponential backoff (1 s → 2 s → 4 s … capped at 30 s).
 * A successful open resets the backoff to the base delay.
 * On component unmount the socket is closed immediately and any pending retry
 * timer is cancelled to prevent memory leaks.
 *
 * Debouncing
 * ──────────
 * Mercury can emit bursts of events during active trading. To avoid hammering
 * React's reconciler, incoming odds are buffered in a ref and flushed to state
 * at most once every DEBOUNCE_MS (500 ms). Only the *latest* event in each
 * window is applied.
 *
 * Flash animation
 * ───────────────
 * `changedIndices` returns the set of outcome indices whose odds changed in the
 * most recent flush. Callers should apply the `flash-update` CSS class to those
 * elements for 500 ms then remove it (see MarketCard.tsx for usage).
 *
 * Mercury Indexer event schema (odds_update)
 * ──────────────────────────────────────────
 * {
 *   "type":      "odds_update",          // discriminant field
 *   "market_id": 1,                      // matches Market.id
 *   "odds":      [55.3, 44.7],           // per-outcome %, index-aligned with
 *                                        //   Market.outcomes, sums to ~100
 *   "timestamp": "2026-03-29T10:00:00Z"  // ISO-8601, informational only
 * }
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Shape of a single Mercury Indexer event that carries odds data */
export interface OddsUpdateEvent {
  type: "odds_update";
  market_id: number;
  /** Per-outcome probability expressed as a percentage (0–100). Index-aligned
   *  with `Market.outcomes`. All values should sum to approximately 100. */
  odds: number[];
  timestamp: string; // ISO-8601
}

export interface UseOddsStreamReturn {
  /** Latest per-outcome odds array. Empty until the first event arrives. */
  odds: number[];
  /** true while the WebSocket handshake has completed and the socket is OPEN */
  connected: boolean;
  /** Indices of outcomes whose odds changed in the last debounced flush.
   *  Cleared on the next flush so callers can apply a one-shot CSS class. */
  changedIndices: Set<number>;
}

// ─── Tuning constants (exported for unit tests) ───────────────────────────────

/** Initial reconnect delay in ms — doubles on each failed attempt */
export const BACKOFF_BASE_MS = 1_000;
/** Upper bound on reconnect delay — prevents unbounded waits */
export const BACKOFF_MAX_MS = 30_000;
/** Debounce window in ms — state is updated at most once per this interval */
export const DEBOUNCE_MS = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Builds the full WebSocket URL for a given market */
function buildWsUrl(marketId: number): string {
  const base =
    process.env.NEXT_PUBLIC_MERCURY_WS_URL ?? "wss://api.mercurydata.app/ws";
  return `${base}/markets/${marketId}/odds`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOddsStream(marketId: number): UseOddsStreamReturn {
  const [odds, setOdds] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const [changedIndices, setChangedIndices] = useState<Set<number>>(new Set());

  // Refs used inside the effect so closures never go stale
  const prevOddsRef = useRef<number[]>([]);
  const pendingOddsRef = useRef<number[] | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Flush the buffered odds to React state.
   * Computes which indices changed relative to the previous flush so callers
   * can trigger the `flash-update` CSS animation on those elements.
   */
  const flushOdds = useCallback((incoming: number[], mounted: { v: boolean }) => {
    if (!mounted.v) return;

    const prev = prevOddsRef.current;
    const changed = new Set<number>();
    incoming.forEach((val, i) => {
      if (prev[i] !== val) changed.add(i);
    });

    setOdds(incoming);
    setChangedIndices(changed);
    prevOddsRef.current = incoming;

    // Auto-clear the changedIndices after the flash duration so the animation
    // fires exactly once per change without a persistent class on the element.
    // 500 ms matches the flash-update CSS animation duration.
    setTimeout(() => {
      if (mounted.v) setChangedIndices(new Set());
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    // Shared mutable flag — lets inner closures check liveness without capturing
    // a stale `mounted` boolean value
    const mounted = { v: true };

    // Reset connection state whenever the target market changes so the UI
    // does not show "Live" while the new socket is still connecting.
    setConnected(false);

    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;
    // Backoff delay tracked in a local variable so each effect instance has its own
    let retryDelay = BACKOFF_BASE_MS;

    /**
     * Debounce incoming odds events.
     * Stores the latest event in a ref and schedules a single state flush after
     * DEBOUNCE_MS. Rapid events within the window overwrite the pending value so
     * only the most-recent snapshot is applied.
     */
    function scheduleOddsUpdate(newOdds: number[]) {
      pendingOddsRef.current = newOdds;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (pendingOddsRef.current !== null) {
          flushOdds(pendingOddsRef.current, mounted);
          pendingOddsRef.current = null;
        }
      }, DEBOUNCE_MS);
    }

    /**
     * Open a new WebSocket connection and wire all lifecycle handlers.
     * Called on initial mount and after each reconnect delay fires.
     */
    function connect() {
      if (!mounted.v) return;

      ws = new WebSocket(buildWsUrl(marketId));

      ws.onopen = () => {
        if (!mounted.v) { ws.close(); return; }
        setConnected(true);
        // Reset backoff — connection succeeded
        retryDelay = BACKOFF_BASE_MS;
      };

      ws.onmessage = (ev: MessageEvent) => {
        if (!mounted.v) return;
        try {
          // Parse and validate the event before touching state
          const event = JSON.parse(ev.data as string) as OddsUpdateEvent;
          if (
            event.type === "odds_update" &&
            event.market_id === marketId &&
            Array.isArray(event.odds)
          ) {
            scheduleOddsUpdate(event.odds);
          }
        } catch {
          // Malformed JSON from the server — discard silently
        }
      };

      // onerror fires before onclose; reconnect logic lives entirely in onclose
      ws.onerror = () => { /* handled by onclose */ };

      ws.onclose = () => {
        if (!mounted.v) return;
        setConnected(false);
        /**
         * Exponential backoff reconnect:
         *   attempt 1 → wait 1 s   → retryDelay becomes  2 s
         *   attempt 2 → wait 2 s   → retryDelay becomes  4 s
         *   attempt 3 → wait 4 s   → retryDelay becomes  8 s
         *   …                       (capped at BACKOFF_MAX_MS = 30 s)
         *
         * The delay is read BEFORE doubling so the first retry fires at BACKOFF_BASE_MS.
         */
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, BACKOFF_MAX_MS);
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    // ── Cleanup — runs on unmount or when marketId changes ────────────────────
    return () => {
      // Signal all closures to stop touching state immediately
      mounted.v = false;

      // Cancel any pending reconnect timer
      clearTimeout(retryTimer);
      // Cancel any buffered debounce flush
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (ws) {
        // Remove onclose before closing to prevent a spurious reconnect attempt
        ws.onclose = null;
        ws.close();
      }
    };
  }, [marketId, flushOdds]); // re-connect whenever the target market changes

  return { odds, connected, changedIndices };
}
