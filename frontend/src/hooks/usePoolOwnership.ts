"use client";
/**
 * usePoolOwnership
 *
 * Fetches bets for a market and subscribes to live WebSocket updates.
 *
 * Flow:
 *   1. GET /api/markets/:id → extract bets[] and total_pool
 *   2. Transform bets into OwnershipSlice[] via buildOwnershipSlices
 *   3. Connect Socket.io, join market room
 *   4. On 'oddsUpdate' event → re-fetch bets to get latest pool state
 *   5. Cleanup: leave room and disconnect on unmount
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { buildOwnershipSlices, OwnershipSlice, RawBet } from "../utils/poolOwnership";

interface UsePoolOwnershipResult {
  slices: OwnershipSlice[];
  totalPool: number;
  loading: boolean;
  error: string | null;
}

export function usePoolOwnership(marketId: number | null): UsePoolOwnershipResult {
  const [slices, setSlices] = useState<OwnershipSlice[]>([]);
  const [totalPool, setTotalPool] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep socket ref so we can clean up without stale closures
  const socketRef = useRef<any>(null);

  const fetchAndBuild = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const bets: RawBet[] = data.bets ?? [];
      const pool = parseFloat(data.market?.total_pool ?? "0");

      setTotalPool(pool);
      setSlices(buildOwnershipSlices(bets, pool));
    } catch (err: any) {
      setError(err.message ?? "Failed to load pool data");
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    if (!marketId) return;

    // Initial fetch
    fetchAndBuild();

    // Connect Socket.io for live updates
    let socket: any;
    (async () => {
      try {
        // Dynamic import so socket.io-client doesn't break SSR
        const { io } = await import("socket.io-client");
        socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", {
          transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          // Join the market room to receive odds updates
          socket.emit("joinMarket", marketId);
        });

        // Re-fetch bets whenever a new bet lands (oddsUpdate fires on new bets)
        socket.on("oddsUpdate", (payload: { marketId: number }) => {
          if (payload.marketId === marketId) {
            fetchAndBuild();
          }
        });
      } catch {
        // Socket.io unavailable — chart still works with static data
      }
    })();

    return () => {
      // Leave room and disconnect on unmount
      if (socketRef.current) {
        socketRef.current.emit("leaveMarket", marketId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [marketId, fetchAndBuild]);

  return { slices, totalPool, loading, error };
}
