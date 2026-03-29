/**
 * useOddsStream.test.ts
 *
 * Tests the full WebSocket lifecycle including:
 * - Initial state
 * - Connection establishment and state updates
 * - Message parsing and odds state updates
 * - Debouncing (max 1 state update per 500 ms)
 * - Exponential backoff reconnect (1 s → 2 s → 4 s … capped at 30 s)
 * - Malformed / unexpected message handling
 * - Clean unmount (no memory leaks, no post-unmount state updates)
 * - marketId change triggers reconnect
 * - BACKOFF_BASE_MS / BACKOFF_MAX_MS / DEBOUNCE_MS constant values
 */

import { renderHook, act } from "@testing-library/react";
import {
  useOddsStream,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DEBOUNCE_MS,
  type OddsUpdateEvent,
} from "../useOddsStream";

// ─── WebSocket mock ───────────────────────────────────────────────────────────

/**
 * Minimal mock WebSocket that exposes helpers to simulate server behaviour.
 * Each `new WebSocket(url)` pushes the created instance onto `wsInstances`.
 */
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /** Simulate a successful server handshake */
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate a raw text message from the server */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Simulate an unclean disconnect (no retry suppression) */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Simulate a WebSocket error (followed by close in real browsers) */
  simulateError() {
    this.onerror?.();
    this.simulateClose();
  }
}

// ── Register mock globally ────────────────────────────────────────────────────
let wsInstances: MockWebSocket[] = [];

beforeAll(() => {
  (global as Record<string, unknown>).WebSocket = MockWebSocket;
});

beforeEach(() => {
  wsInstances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ─── Constant values ──────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("BACKOFF_BASE_MS is 1 000 ms", () => expect(BACKOFF_BASE_MS).toBe(1_000));
  it("BACKOFF_MAX_MS is 30 000 ms", () => expect(BACKOFF_MAX_MS).toBe(30_000));
  it("DEBOUNCE_MS is 500 ms", () => expect(DEBOUNCE_MS).toBe(500));
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("returns empty odds array before any message", () => {
    const { result } = renderHook(() => useOddsStream(1));
    expect(result.current.odds).toEqual([]);
  });

  it("returns connected=false before socket opens", () => {
    const { result } = renderHook(() => useOddsStream(1));
    expect(result.current.connected).toBe(false);
  });

  it("returns empty changedIndices before first message", () => {
    const { result } = renderHook(() => useOddsStream(1));
    expect(result.current.changedIndices.size).toBe(0);
  });

  it("creates exactly one WebSocket on mount", () => {
    renderHook(() => useOddsStream(1));
    expect(wsInstances).toHaveLength(1);
  });

  it("opens socket to the correct URL for the given marketId", () => {
    renderHook(() => useOddsStream(42));
    expect(wsInstances[0].url).toContain("42");
  });
});

// ─── Connection lifecycle ────────────────────────────────────────────────────

describe("connection lifecycle", () => {
  it("sets connected=true when socket opens", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => wsInstances[0].simulateOpen());
    expect(result.current.connected).toBe(true);
  });

  it("sets connected=false when socket closes", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateClose();
    });
    // Prevent the pending reconnect timer from firing past this test
    jest.clearAllTimers();
    expect(result.current.connected).toBe(false);
  });
});

// ─── Message handling ─────────────────────────────────────────────────────────

describe("message handling", () => {
  function makeEvent(marketId: number, odds: number[]): OddsUpdateEvent {
    return { type: "odds_update", market_id: marketId, odds, timestamp: "2026-01-01T00:00:00Z" };
  }

  it("updates odds after debounce window elapses", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent(1, [60, 40]));
    });
    // State not yet updated (debounce pending)
    expect(result.current.odds).toEqual([]);

    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([60, 40]);
  });

  it("ignores events for a different market_id", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent(99, [55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([]);
  });

  it("ignores events with an unrecognised type", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage({ type: "bet_placed", market_id: 1, odds: [50, 50] });
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([]);
  });

  it("handles malformed JSON without throwing", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].onmessage?.({ data: "not valid json {{{{" });
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([]);
  });

  it("handles null odds array gracefully (ignores event)", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage({ type: "odds_update", market_id: 1, odds: null });
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([]);
  });

  it("reports changedIndices for outcomes that changed value", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent(1, [55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    // Both indices changed from the initial empty state
    expect(result.current.changedIndices.has(0)).toBe(true);
    expect(result.current.changedIndices.has(1)).toBe(true);
  });

  it("changedIndices clears after the flash duration (500 ms)", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent(1, [55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.changedIndices.size).toBeGreaterThan(0);

    // Advance past the flash-clear timeout (also DEBOUNCE_MS = 500 ms)
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.changedIndices.size).toBe(0);
  });

  it("changedIndices only contains indices whose value actually changed", () => {
    const { result } = renderHook(() => useOddsStream(1));

    // First update: set baseline
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent(1, [55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS * 2));

    // Second update: only outcome 0 changes
    act(() => wsInstances[0].simulateMessage(makeEvent(1, [60, 45])));
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));

    expect(result.current.changedIndices.has(0)).toBe(true);
    expect(result.current.changedIndices.has(1)).toBe(false);
  });
});

// ─── Debouncing ───────────────────────────────────────────────────────────────

describe("debouncing", () => {
  function makeEvent(odds: number[]): OddsUpdateEvent {
    return { type: "odds_update", market_id: 1, odds, timestamp: "2026-01-01T00:00:00Z" };
  }

  it("applies only the last of several rapid messages", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      // Three messages arrive within the debounce window
      wsInstances[0].simulateMessage(makeEvent([51, 49]));
      wsInstances[0].simulateMessage(makeEvent([52, 48]));
      wsInstances[0].simulateMessage(makeEvent([60, 40]));
    });
    // State still unchanged — window hasn't elapsed
    expect(result.current.odds).toEqual([]);

    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    // Only the LAST value should have been applied
    expect(result.current.odds).toEqual([60, 40]);
  });

  it("does not update state before DEBOUNCE_MS elapses", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent([55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS - 1));
    expect(result.current.odds).toEqual([]);
  });

  it("allows a second flush after the first window closes", () => {
    const { result } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage(makeEvent([55, 45]));
    });
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS * 2));
    expect(result.current.odds).toEqual([55, 45]);

    act(() => wsInstances[0].simulateMessage(makeEvent([70, 30])));
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([70, 30]);
  });
});

// ─── Exponential backoff reconnect ───────────────────────────────────────────
//
// Key invariant: simulateOpen() resets the backoff delay to BACKOFF_BASE_MS.
// The doubling tests therefore use close-without-open to force consecutive
// failures and observe the correct accumulated delay.

describe("exponential backoff reconnect", () => {
  it("reconnects after first disconnect (BACKOFF_BASE_MS delay)", () => {
    renderHook(() => useOddsStream(1));
    // Close without prior open → immediate failure scenario
    act(() => wsInstances[0].simulateClose());
    expect(wsInstances).toHaveLength(1); // not yet reconnected

    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS));
    expect(wsInstances).toHaveLength(2); // reconnected
  });

  it("doubles the delay on consecutive failures (no successful open between)", () => {
    renderHook(() => useOddsStream(1));

    // Failure 1: schedules retry at BACKOFF_BASE_MS (1 s), retryDelay → 2 s
    act(() => wsInstances[0].simulateClose());
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS)); // ws[1] created

    // Failure 2: schedules retry at 2 s (retryDelay was NOT reset — no open)
    act(() => wsInstances[1].simulateClose());

    // 1 s in — should NOT reconnect yet (need 2 s)
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS));
    expect(wsInstances).toHaveLength(2);

    // 1 s more (total 2 s) — reconnect fires
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS));
    expect(wsInstances).toHaveLength(3);
  });

  it("caps reconnect delay at BACKOFF_MAX_MS (30 s)", () => {
    renderHook(() => useOddsStream(1));

    // Drive the delay up to the cap using consecutive closes (no opens):
    //   close → 1 s → close → 2 s → close → 4 s → close → 8 s → close → 16 s → ws[5]
    // At this point retryDelay inside the hook has reached 30 s.
    let delay = BACKOFF_BASE_MS;
    let wsIndex = 0;

    while (delay < BACKOFF_MAX_MS) {
      act(() => wsInstances[wsIndex].simulateClose());
      act(() => jest.advanceTimersByTime(delay));
      wsIndex++;
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
    }

    // One more failure at the cap delay
    const countBefore = wsInstances.length;
    act(() => wsInstances[wsIndex].simulateClose());

    // Advance by one ms shy of the cap — should NOT reconnect
    act(() => jest.advanceTimersByTime(BACKOFF_MAX_MS - 1));
    expect(wsInstances).toHaveLength(countBefore);

    // Advance the remaining 1 ms — reconnect fires
    act(() => jest.advanceTimersByTime(1));
    expect(wsInstances).toHaveLength(countBefore + 1);
  });

  it("resets delay to BACKOFF_BASE_MS after a successful open", () => {
    renderHook(() => useOddsStream(1));

    // Two consecutive failures → retryDelay reaches 4 s inside the hook
    act(() => wsInstances[0].simulateClose());
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS)); // ws[1]
    act(() => wsInstances[1].simulateClose());
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS * 2)); // ws[2]

    // ws[2] opens successfully → retryDelay resets to BACKOFF_BASE_MS (1 s)
    act(() => wsInstances[2].simulateOpen());

    // ws[2] closes — next retry must use the reset 1 s delay
    act(() => wsInstances[2].simulateClose());
    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS)); // 1 s
    expect(wsInstances).toHaveLength(4);
  });
});

// ─── Unmount / cleanup ────────────────────────────────────────────────────────

describe("unmount cleanup", () => {
  it("closes the WebSocket when the component unmounts", () => {
    const { unmount } = renderHook(() => useOddsStream(1));
    act(() => wsInstances[0].simulateOpen());

    unmount();

    expect(wsInstances[0].readyState).toBe(MockWebSocket.CLOSED);
  });

  it("does not schedule a reconnect after unmount", () => {
    const { unmount } = renderHook(() => useOddsStream(1));
    act(() => wsInstances[0].simulateOpen());

    unmount();
    const countBefore = wsInstances.length;

    act(() => jest.advanceTimersByTime(BACKOFF_MAX_MS));
    expect(wsInstances).toHaveLength(countBefore); // no new sockets
  });

  it("cancels a pending reconnect timer when unmounted during backoff", () => {
    const { unmount } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateClose(); // triggers 1 s backoff timer
    });
    // Unmount before timer fires
    unmount();
    const countBefore = wsInstances.length;

    act(() => jest.advanceTimersByTime(BACKOFF_BASE_MS));
    expect(wsInstances).toHaveLength(countBefore); // no reconnect
  });

  it("cancels a pending debounce flush when unmounted", () => {
    const { result, unmount } = renderHook(() => useOddsStream(1));
    act(() => {
      wsInstances[0].simulateOpen();
      wsInstances[0].simulateMessage({
        type: "odds_update",
        market_id: 1,
        odds: [60, 40],
        timestamp: "2026-01-01T00:00:00Z",
      });
    });
    unmount();

    // Advancing time should NOT throw and state should remain empty
    act(() => jest.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.odds).toEqual([]);
  });
});

// ─── marketId change ─────────────────────────────────────────────────────────

describe("marketId change", () => {
  it("opens a new socket for the new marketId", () => {
    const { rerender } = renderHook(
      ({ id }: { id: number }) => useOddsStream(id),
      { initialProps: { id: 1 } }
    );

    act(() => wsInstances[0].simulateOpen());
    rerender({ id: 2 });

    expect(wsInstances).toHaveLength(2);
    expect(wsInstances[1].url).toContain("2");
  });

  it("closes the old socket when marketId changes", () => {
    const { rerender } = renderHook(
      ({ id }: { id: number }) => useOddsStream(id),
      { initialProps: { id: 1 } }
    );

    act(() => wsInstances[0].simulateOpen());
    rerender({ id: 2 });

    expect(wsInstances[0].readyState).toBe(MockWebSocket.CLOSED);
  });

  it("resets connected state on marketId change", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useOddsStream(id),
      { initialProps: { id: 1 } }
    );

    act(() => wsInstances[0].simulateOpen());
    expect(result.current.connected).toBe(true);

    rerender({ id: 2 });
    // New socket not yet open
    expect(result.current.connected).toBe(false);
  });
});

// ─── WebSocket URL construction ───────────────────────────────────────────────

describe("WebSocket URL", () => {
  it("embeds the marketId in the socket URL", () => {
    renderHook(() => useOddsStream(7));
    expect(wsInstances[0].url).toContain("7");
  });

  it("falls back to the default Mercury endpoint when env var is absent", () => {
    renderHook(() => useOddsStream(1));
    expect(wsInstances[0].url).toContain("mercurydata.app");
  });
});
