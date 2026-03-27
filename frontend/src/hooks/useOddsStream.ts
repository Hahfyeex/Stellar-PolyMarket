"use client";
/**
 * useOddsStream
 *
 * Streams live per-outcome odds for a prediction market via the Mercury Indexer
 * WebSocket pipeline:
 *
 *   Mercury Indexer → POST /api/indexer/webhook
 *       → Postgres NOTIFY odds_updates
 *       → Socket.IO backend (websocket.js)
 *       → 'oddsUpdate' event → this hook
 *
 * Features:
 *  - Fetches initial odds from REST on connect, then re-fetches on each live event
 *  - Debounces rapid event bursts: at most 1 state update per DEBOUNCE_MS (500 ms)
 *  - Detects per-outcome changes; marks changed indices for a yellow flash animation
 *  - Reconnects with exponential backoff: 1 s → 2 s → 4 s → … → 30 s (MAX_BACKOFF_MS)
 *  - Emits leaveMarket + disconnects socket on component unmount
 *  - Guards all post-unmount state writes with isMountedRef
 */
import { useState, useEffect, useRef } from "react";

// ── Public types ───────────────────────────────────────────────────────────────

/** Live snapshot of odds for a single outcome */
export interface OutcomeOdds {
  outcomeIndex: number;
  /** Total XLM staked on this outcome */
  stake: number;
  /** Percentage of total pool (0–100) */
  pct: number;
  /** Total pool size across all outcomes */
  totalPool: number;
}

/** Minimal bet record shape used to compute odds */
export interface BetStake {
  outcome_index: number;
  amount: string | number;
}

/** Return value of useOddsStream */
export interface UseOddsStreamResult {
  /** Current per-outcome odds, updated live */
  odds: OutcomeOdds[];
  /** Set of outcome indices whose odds changed in the latest update (cleared after FLASH_DURATION_MS) */
  flashingIndices: Set<number>;
  loading: boolean;
  error: string | null;
  /** true while the Socket.IO connection is open */
  connected: boolean;
}

// ── Pure utility functions (exported for unit testing) ────────────────────────

/** Hard cap on reconnect delay */
export const MAX_BACKOFF_MS = 30_000;

/**
 * Computes the exponential backoff delay for reconnect attempt N.
 *
 * Algorithm: delay = min(2^attempt × 1 000 ms, MAX_BACKOFF_MS)
 *   attempt 0 →  1 000 ms
 *   attempt 1 →  2 000 ms
 *   attempt 2 →  4 000 ms
 *   attempt 3 →  8 000 ms
 *   attempt 4 → 16 000 ms
 *   attempt 5+ → 30 000 ms  (hard cap)
 *
 * @param attempt - zero-based reconnect attempt counter
 */
export function calcBackoffMs(attempt: number): number {
  return Math.min(Math.pow(2, attempt) * 1_000, MAX_BACKOFF_MS);
}

/**
 * Derives per-outcome odds from a flat list of bet stakes.
 *
 * Accumulates each outcome's total stake, then computes its percentage
 * share of the total pool. Outcomes with no bets get stake=0, pct=0.
 *
 * @param bets        - raw bet records from the API
 * @param totalPool   - total XLM staked across all outcomes
 * @param numOutcomes - number of outcomes (determines result array length)
 */
export function calcOutcomeOdds(
  bets: BetStake[],
  totalPool: number,
  numOutcomes: number
): OutcomeOdds[] {
  // Accumulate stake per outcome index
  const stakeMap = new Map<number, number>();
  for (const bet of bets) {
    const prev = stakeMap.get(bet.outcome_index) ?? 0;
    stakeMap.set(bet.outcome_index, prev + parseFloat(String(bet.amount)));
  }

  return Array.from({ length: numOutcomes }, (_, i) => {
    const stake = stakeMap.get(i) ?? 0;
    const pct = totalPool > 0 ? Math.min((stake / totalPool) * 100, 100) : 0;
    return { outcomeIndex: i, stake, pct, totalPool };
  });
}

/**
 * Compares two odds snapshots and returns the set of outcome indices whose
 * percentage changed — these indices should receive the flash-update CSS class.
 *
 * An outcome is flagged as changed if:
 *  - it is new (not present in the previous snapshot), OR
 *  - its pct value differs from the previous snapshot
 *
 * @param prev - previous OutcomeOdds array
 * @param next - new OutcomeOdds array
 */
export function didOddsChange(
  prev: OutcomeOdds[],
  next: OutcomeOdds[]
): Set<number> {
  const changed = new Set<number>();
  const prevMap = new Map(prev.map((o) => [o.outcomeIndex, o.pct]));
  for (const o of next) {
    const prevPct = prevMap.get(o.outcomeIndex);
    if (prevPct === undefined || prevPct !== o.pct) {
      changed.add(o.outcomeIndex);
    }
  }
  return changed;
}

// ── Internal constants ─────────────────────────────────────────────────────────

/** Max 1 state update per this many ms — batches rapid on-chain event bursts */
const DEBOUNCE_MS = 500;

/** Duration the flash-update CSS class stays applied after an odds change */
const FLASH_DURATION_MS = 500;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOddsStream(marketId: number | null): UseOddsStreamResult {
  const [odds, setOdds] = useState<OutcomeOdds[]>([]);
  const [flashingIndices, setFlashingIndices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Refs live outside the effect so async callbacks always see fresh values
  const socketRef = useRef<any>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Holds the last computed odds so the next fetch can diff against them */
  const oddsRef = useRef<OutcomeOdds[]>([]);
  /** Prevents state updates after the component has unmounted */
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!marketId) return;

    isMountedRef.current = true;

    // Local reconnect state — scoped to this effect instance so it is reset
    // on every marketId change without leaking across renders.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0; // increments on each failed connection; reset to 0 on success

    // ── Fetch odds from REST API ───────────────────────────────────────────────
    /**
     * Fetches the current market bets, computes per-outcome odds, and diffs
     * them against the previous snapshot to determine which indices changed.
     * Changed indices get the flash-update class for FLASH_DURATION_MS.
     */
    async function fetchOdds(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Guard: component may have unmounted while fetch was in flight
        if (!isMountedRef.current) return;

        const bets: BetStake[] = data.bets ?? [];
        const totalPool = parseFloat(data.market?.total_pool ?? "0");
        const numOutcomes: number = data.market?.outcomes?.length ?? 0;

        const nextOdds = calcOutcomeOdds(bets, totalPool, numOutcomes);
        const changed = didOddsChange(oddsRef.current, nextOdds);

        // Apply yellow flash to outcomes whose percentage shifted
        if (changed.size > 0) {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          setFlashingIndices(changed);
          flashTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setFlashingIndices(new Set());
          }, FLASH_DURATION_MS);
        }

        oddsRef.current = nextOdds;
        setOdds(nextOdds);
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(err.message ?? "Failed to load odds");
        }
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }

    // ── Debounced fetch ────────────────────────────────────────────────────────
    /**
     * Wraps fetchOdds in a trailing-edge debounce so that rapid bursts of
     * oddsUpdate events (e.g. many bets in one Stellar ledger close) result
     * in at most one state update per DEBOUNCE_MS.
     *
     * Each call clears the pending timer and schedules a new one, so only the
     * final event in a burst triggers fetchOdds.
     */
    function debouncedFetch(): void {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(fetchOdds, DEBOUNCE_MS);
    }

    // ── Reconnect with exponential backoff ─────────────────────────────────────
    /**
     * Schedules the next connection attempt after a delay determined by the
     * current attempt counter.
     *
     * Backoff sequence (seconds): 1 → 2 → 4 → 8 → 16 → 30 → 30 → …
     * The hard cap (MAX_BACKOFF_MS = 30 s) prevents indefinitely long waits.
     */
    function scheduleReconnect(): void {
      if (!isMountedRef.current) return;
      const delay = calcBackoffMs(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connectSocket, delay);
    }

    // ── WebSocket connection ───────────────────────────────────────────────────
    /**
     * Opens a Socket.IO connection to the backend, which relays contract events
     * delivered by the Mercury Indexer via Postgres NOTIFY → Socket.IO broadcast.
     *
     * On connect:
     *   - Emits 'joinMarket' to scope future oddsUpdate events to this market
     *   - Fetches fresh odds immediately
     *   - Resets the backoff counter
     *
     * On oddsUpdate:
     *   - Debounces the state refresh so rapid bursts are batched
     *
     * On disconnect / connect_error:
     *   - Schedules a reconnect with exponential backoff
     */
    async function connectSocket(): Promise<void> {
      // Clear any pending reconnect timer before starting a fresh attempt
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      try {
        // Dynamic import prevents SSR breakage in Next.js App Router —
        // socket.io-client uses browser APIs unavailable on the server.
        const { io } = await import("socket.io-client");

        const socket = io(
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
          { transports: ["websocket"] }
        );
        socketRef.current = socket;

        socket.on("connect", () => {
          if (!isMountedRef.current) return;
          // Successful connection — reset backoff so next disconnect starts fresh
          attempt = 0;
          setConnected(true);
          setError(null);
          // Join the market-specific room; the backend only broadcasts
          // oddsUpdate events to clients subscribed to that room.
          socket.emit("joinMarket", marketId);
          // Immediately pull the current odds — don't wait for the first event
          fetchOdds();
        });

        /**
         * Mercury Indexer event: fires whenever a new Bet is recorded on-chain.
         * Payload shape: { marketId: number, ...optional extras }
         *
         * We ignore events for other markets (marketId guard) and debounce
         * rapid bursts that arrive within the same ledger close window.
         */
        socket.on("oddsUpdate", (payload: { marketId: number }) => {
          if (!isMountedRef.current || payload.marketId !== marketId) return;
          debouncedFetch();
        });

        socket.on("disconnect", () => {
          if (!isMountedRef.current) return;
          setConnected(false);
          scheduleReconnect();
        });

        socket.on("connect_error", () => {
          if (!isMountedRef.current) return;
          setConnected(false);
          scheduleReconnect();
        });
      } catch {
        // socket.io-client unavailable (SSR context or import failure)
        // — odds are still shown via the last successful fetch; retry later.
        scheduleReconnect();
      }
    }

    // Initiate first connection
    connectSocket();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      // Signal async callbacks not to update state after unmount
      isMountedRef.current = false;

      // Cancel all pending timers to prevent post-unmount side-effects
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

      // Gracefully unsubscribe from the market room then close the socket
      if (socketRef.current) {
        socketRef.current.emit("leaveMarket", marketId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [marketId]); // Re-run only when the watched market changes

  return { odds, flashingIndices, loading, error, connected };
}
