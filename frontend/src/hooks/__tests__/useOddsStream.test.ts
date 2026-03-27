/**
 * useOddsStream — unit tests
 *
 * Coverage targets:
 *   - calcBackoffMs: all attempt values, MAX_BACKOFF_MS cap
 *   - calcOutcomeOdds: normal, empty, zero-pool, multi-bet, stake overflow
 *   - didOddsChange: unchanged, partial change, new outcome, all changed, empty
 *   - Hook lifecycle: mount, connect, oddsUpdate, disconnect, reconnect, unmount
 *   - Debounce: rapid events batched to 1 call per 500 ms
 *   - Flash animation: indices set on change, cleared after FLASH_DURATION_MS
 *   - Null marketId: hook stays idle, no fetch/socket
 *   - Fetch error: error state set, loading cleared
 *   - Non-ok HTTP response: error state set
 */

import { renderHook, act } from "@testing-library/react";
import {
  calcBackoffMs,
  calcOutcomeOdds,
  didOddsChange,
  useOddsStream,
  MAX_BACKOFF_MS,
  type OutcomeOdds,
  type BetStake,
} from "../useOddsStream";

// ── Socket.IO mock ─────────────────────────────────────────────────────────────
// jest.mock is hoisted before variable declarations; the factory captures
// `mockSocket` by reference so that beforeEach can swap it before each test.
let mockHandlers: Record<string, (...args: any[]) => void> = {};
let mockSocket: {
  on: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
};

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => mockSocket),
}));

// ── fetch mock ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULT_MARKET_RESPONSE = {
  bets: [
    { outcome_index: 0, amount: "150" },
    { outcome_index: 1, amount: "50" },
  ],
  market: { total_pool: "200", outcomes: ["Yes", "No"] },
};

function setupFetch(response = DEFAULT_MARKET_RESPONSE, ok = true) {
  mockFetch.mockResolvedValue({
    ok,
    json: async () => response,
  });
}

/** Trigger a socket event registered via socket.on(event, handler) */
function triggerSocketEvent(event: string, ...args: any[]) {
  mockHandlers[event]?.(...args);
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();

  mockHandlers = {};
  mockSocket = {
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      mockHandlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  setupFetch();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── calcBackoffMs ──────────────────────────────────────────────────────────────

describe("calcBackoffMs", () => {
  it("returns 1 000 ms for attempt 0", () => {
    expect(calcBackoffMs(0)).toBe(1_000);
  });

  it("returns 2 000 ms for attempt 1", () => {
    expect(calcBackoffMs(1)).toBe(2_000);
  });

  it("returns 4 000 ms for attempt 2", () => {
    expect(calcBackoffMs(2)).toBe(4_000);
  });

  it("returns 8 000 ms for attempt 3", () => {
    expect(calcBackoffMs(3)).toBe(8_000);
  });

  it("returns 16 000 ms for attempt 4", () => {
    expect(calcBackoffMs(4)).toBe(16_000);
  });

  it("caps at MAX_BACKOFF_MS for attempt 5", () => {
    expect(calcBackoffMs(5)).toBe(MAX_BACKOFF_MS);
  });

  it("caps at MAX_BACKOFF_MS for large attempt numbers", () => {
    expect(calcBackoffMs(100)).toBe(MAX_BACKOFF_MS);
  });

  it("MAX_BACKOFF_MS is 30 000 ms", () => {
    expect(MAX_BACKOFF_MS).toBe(30_000);
  });

  it("increases monotonically up to the cap", () => {
    const delays = [0, 1, 2, 3, 4].map(calcBackoffMs);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });
});

// ── calcOutcomeOdds ────────────────────────────────────────────────────────────

describe("calcOutcomeOdds", () => {
  it("computes correct stakes and percentages for two outcomes", () => {
    const bets: BetStake[] = [
      { outcome_index: 0, amount: "150" },
      { outcome_index: 1, amount: "50" },
    ];
    const result = calcOutcomeOdds(bets, 200, 2);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ outcomeIndex: 0, stake: 150, pct: 75, totalPool: 200 });
    expect(result[1]).toEqual({ outcomeIndex: 1, stake: 50, pct: 25, totalPool: 200 });
  });

  it("accumulates multiple bets on the same outcome", () => {
    const bets: BetStake[] = [
      { outcome_index: 0, amount: "100" },
      { outcome_index: 0, amount: "50" },
      { outcome_index: 1, amount: "50" },
    ];
    const result = calcOutcomeOdds(bets, 200, 2);
    expect(result[0].stake).toBe(150);
    expect(result[0].pct).toBe(75);
  });

  it("returns pct=0 for all outcomes when totalPool is 0", () => {
    const bets: BetStake[] = [{ outcome_index: 0, amount: "0" }];
    const result = calcOutcomeOdds(bets, 0, 2);
    expect(result[0].pct).toBe(0);
    expect(result[1].pct).toBe(0);
  });

  it("returns stake=0 and pct=0 for outcomes with no bets", () => {
    const bets: BetStake[] = [{ outcome_index: 0, amount: "100" }];
    const result = calcOutcomeOdds(bets, 100, 3);
    expect(result[1].stake).toBe(0);
    expect(result[1].pct).toBe(0);
    expect(result[2].stake).toBe(0);
    expect(result[2].pct).toBe(0);
  });

  it("returns empty array when numOutcomes is 0", () => {
    expect(calcOutcomeOdds([], 100, 0)).toEqual([]);
  });

  it("handles string amounts that need parsing", () => {
    const bets: BetStake[] = [{ outcome_index: 0, amount: "75.5" }];
    const result = calcOutcomeOdds(bets, 100, 2);
    expect(result[0].stake).toBeCloseTo(75.5);
  });

  it("handles numeric amount field", () => {
    const bets: BetStake[] = [{ outcome_index: 1, amount: 80 }];
    const result = calcOutcomeOdds(bets, 100, 2);
    expect(result[1].stake).toBe(80);
    expect(result[1].pct).toBe(80);
  });

  it("clamps pct to 100 even if stake exceeds totalPool", () => {
    const bets: BetStake[] = [{ outcome_index: 0, amount: "200" }];
    const result = calcOutcomeOdds(bets, 100, 1);
    expect(result[0].pct).toBe(100);
  });

  it("attaches totalPool to every result entry", () => {
    const result = calcOutcomeOdds([], 500, 2);
    expect(result[0].totalPool).toBe(500);
    expect(result[1].totalPool).toBe(500);
  });

  it("assigns correct outcomeIndex values", () => {
    const result = calcOutcomeOdds([], 0, 3);
    expect(result.map((o) => o.outcomeIndex)).toEqual([0, 1, 2]);
  });
});

// ── didOddsChange ─────────────────────────────────────────────────────────────

describe("didOddsChange", () => {
  const makeOdds = (entries: [number, number][]): OutcomeOdds[] =>
    entries.map(([idx, pct]) => ({ outcomeIndex: idx, pct, stake: 0, totalPool: 0 }));

  it("returns empty set when nothing changed", () => {
    const snap = makeOdds([[0, 75], [1, 25]]);
    expect(didOddsChange(snap, snap)).toEqual(new Set());
  });

  it("detects a changed pct on one outcome", () => {
    const prev = makeOdds([[0, 75], [1, 25]]);
    const next = makeOdds([[0, 60], [1, 40]]);
    const changed = didOddsChange(prev, next);
    expect(changed).toEqual(new Set([0, 1]));
  });

  it("only flags outcomes whose pct actually changed", () => {
    const prev = makeOdds([[0, 75], [1, 25]]);
    const next = makeOdds([[0, 75], [1, 30]]); // only index 1 changed
    const changed = didOddsChange(prev, next);
    expect(changed.has(0)).toBe(false);
    expect(changed.has(1)).toBe(true);
  });

  it("flags all outcomes when prev is empty (first update)", () => {
    const next = makeOdds([[0, 60], [1, 40]]);
    const changed = didOddsChange([], next);
    expect(changed).toEqual(new Set([0, 1]));
  });

  it("returns empty set when next is empty", () => {
    const prev = makeOdds([[0, 75], [1, 25]]);
    expect(didOddsChange(prev, [])).toEqual(new Set());
  });

  it("returns empty set when both prev and next are empty", () => {
    expect(didOddsChange([], [])).toEqual(new Set());
  });

  it("handles three outcomes with partial change", () => {
    const prev = makeOdds([[0, 50], [1, 30], [2, 20]]);
    const next = makeOdds([[0, 50], [1, 30], [2, 25]]);
    const changed = didOddsChange(prev, next);
    expect(changed).toEqual(new Set([2]));
  });
});

// ── useOddsStream — socket lifecycle ─────────────────────────────────────────

describe("useOddsStream — socket lifecycle", () => {
  it("returns stable initial state before socket connects", () => {
    const { result } = renderHook(() => useOddsStream(1));
    expect(result.current.odds).toEqual([]);
    expect(result.current.flashingIndices).toEqual(new Set());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it("does not create a socket when marketId is null", () => {
    const { io } = require("socket.io-client");
    renderHook(() => useOddsStream(null));
    // Flush all timers — no socket should be created
    act(() => { jest.runAllTimers(); });
    expect(io).not.toHaveBeenCalled();
  });

  it("creates a socket connection and joins the market room on connect", async () => {
    renderHook(() => useOddsStream(42));

    // Flush the dynamic import microtask
    await act(async () => { await Promise.resolve(); });

    // connect handler should be registered
    expect(mockSocket.on).toHaveBeenCalledWith("connect", expect.any(Function));

    // Simulate the socket connecting
    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("joinMarket", 42);
  });

  it("sets connected=true and clears error after connect", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("fetches odds immediately after connect", async () => {
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/markets/1")
    );
  });

  it("populates odds state from fetch response", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    // Odds should now be populated (2 outcomes from MARKET_RESPONSE)
    expect(result.current.odds).toHaveLength(2);
    expect(result.current.odds[0].pct).toBeCloseTo(75);
    expect(result.current.odds[1].pct).toBeCloseTo(25);
  });

  it("sets error state on non-ok HTTP response", async () => {
    setupFetch(DEFAULT_MARKET_RESPONSE, false);
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(result.current.error).toMatch(/HTTP/);
    expect(result.current.loading).toBe(false);
  });

  it("sets error state on fetch network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.loading).toBe(false);
  });

  it("sets connected=false on disconnect and schedules reconnect", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    // Connect first
    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(true);

    // Simulate disconnect
    act(() => { triggerSocketEvent("disconnect"); });

    expect(result.current.connected).toBe(false);
  });

  it("sets connected=false on connect_error and schedules reconnect", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    act(() => { triggerSocketEvent("connect_error"); });

    expect(result.current.connected).toBe(false);
  });

  it("reconnects after disconnect with 1 s backoff on first attempt", async () => {
    const { io } = require("socket.io-client");
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    // First io() call happened on mount
    expect(io).toHaveBeenCalledTimes(1);

    // Disconnect triggers scheduleReconnect (attempt=0 → 1 000 ms)
    act(() => { triggerSocketEvent("disconnect"); });

    // Advance past the 1 s backoff
    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    // io() should have been called again for the reconnect
    expect(io).toHaveBeenCalledTimes(2);
  });

  it("registers oddsUpdate handler on the socket", async () => {
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    expect(mockSocket.on).toHaveBeenCalledWith("oddsUpdate", expect.any(Function));
  });

  it("ignores oddsUpdate events for a different marketId", async () => {
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    const callsAfterConnect = mockFetch.mock.calls.length;

    // Fire an event for market 99 — should be ignored
    act(() => { triggerSocketEvent("oddsUpdate", { marketId: 99 }); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(mockFetch).toHaveBeenCalledTimes(callsAfterConnect);
  });

  it("emits leaveMarket and disconnects socket on unmount", async () => {
    const { unmount } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith("leaveMarket", 1);
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});

// ── Debounce behaviour ────────────────────────────────────────────────────────

describe("useOddsStream — debounce", () => {
  it("batches rapid oddsUpdate events into a single fetch", async () => {
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    const callsAfterConnect = mockFetch.mock.calls.length;

    // Fire 5 events in quick succession
    act(() => {
      for (let i = 0; i < 5; i++) {
        triggerSocketEvent("oddsUpdate", { marketId: 1 });
      }
    });

    // Before the debounce window ends — no extra fetch
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterConnect);

    // Advance past the 500 ms debounce
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    // Exactly one additional fetch should have fired
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterConnect + 1);
  });

  it("resets the debounce timer on each new event", async () => {
    renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    const callsAfterConnect = mockFetch.mock.calls.length;

    // Fire an event, advance 400 ms (not yet past debounce)
    act(() => { triggerSocketEvent("oddsUpdate", { marketId: 1 }); });
    act(() => { jest.advanceTimersByTime(400); });

    // Fire another event — resets the 500 ms window
    act(() => { triggerSocketEvent("oddsUpdate", { marketId: 1 }); });
    act(() => { jest.advanceTimersByTime(400); });

    // Still within the new 500 ms window — no fetch yet
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterConnect);

    // Now advance past the debounce
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(callsAfterConnect + 1);
  });
});

// ── Flash animation behaviour ──────────────────────────────────────────────────

describe("useOddsStream — flash animation", () => {
  it("sets flashingIndices when odds change after fetch", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    // On first fetch from empty prev-odds, all outcomes should be flashing
    expect(result.current.flashingIndices.size).toBeGreaterThan(0);
  });

  it("clears flashingIndices after 500 ms", async () => {
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    expect(result.current.flashingIndices.size).toBeGreaterThan(0);

    // Advance past FLASH_DURATION_MS
    act(() => { jest.advanceTimersByTime(500); });

    expect(result.current.flashingIndices.size).toBe(0);
  });

  it("does not flash when odds are identical to previous snapshot", async () => {
    // First fetch establishes baseline
    const { result } = renderHook(() => useOddsStream(1));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      triggerSocketEvent("connect");
      await Promise.resolve();
    });

    // Clear the initial flash
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.flashingIndices.size).toBe(0);

    // Second fetch returns identical data — no flash should occur
    await act(async () => {
      triggerSocketEvent("oddsUpdate", { marketId: 1 });
      jest.advanceTimersByTime(500); // past debounce
      await Promise.resolve();
    });

    expect(result.current.flashingIndices.size).toBe(0);
  });
});
