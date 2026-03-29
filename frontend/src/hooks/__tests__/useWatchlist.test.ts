/**
 * Tests for useWatchlist hook
 */
import { renderHook, act } from "@testing-library/react";
import { useWatchlist } from "../useWatchlist";

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => localStorageMock.clear());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useWatchlist", () => {
  it("initializes with empty watchlist", () => {
    const { result } = renderHook(() => useWatchlist());
    expect(result.current.watchlist.size).toBe(0);
  });

  it("adds a market to watchlist", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      result.current.addToWatchlist(1);
    });

    expect(result.current.isWatched(1)).toBe(true);
    expect(result.current.watchlist.size).toBe(1);
  });

  it("removes a market from watchlist", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      result.current.addToWatchlist(1);
    });
    
    expect(result.current.isWatched(1)).toBe(true);
    
    act(() => {
      result.current.removeFromWatchlist(1);
    });

    expect(result.current.isWatched(1)).toBe(false);
    expect(result.current.watchlist.size).toBe(0);
  });

  it("toggles market in watchlist", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      result.current.toggleWatchlist(1);
    });

    expect(result.current.isWatched(1)).toBe(true);
    
    act(() => {
      result.current.toggleWatchlist(1);
    });

    expect(result.current.isWatched(1)).toBe(false);
  });

  it("persists watchlist to localStorage", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      result.current.addToWatchlist(1);
      result.current.addToWatchlist(2);
    });

    const stored = JSON.parse(localStorageMock.getItem("stella_watchlist") || "[]");
    expect(stored).toContain(1);
    expect(stored).toContain(2);
  });

  it("restores watchlist from localStorage", () => {
    localStorageMock.setItem("stella_watchlist", JSON.stringify([1, 2, 3]));
    
    const { result } = renderHook(() => useWatchlist());

    expect(result.current.isWatched(1)).toBe(true);
    expect(result.current.isWatched(2)).toBe(true);
    expect(result.current.isWatched(3)).toBe(true);
    expect(result.current.watchlist.size).toBe(3);
  });

  it("handles corrupted localStorage data", () => {
    localStorageMock.setItem("stella_watchlist", "not-json{{");
    
    const { result } = renderHook(() => useWatchlist());

    expect(result.current.watchlist.size).toBe(0);
  });

  it("allows multiple markets in watchlist", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      for (let i = 1; i <= 5; i++) {
        result.current.addToWatchlist(i);
      }
    });

    expect(result.current.watchlist.size).toBe(5);
    for (let i = 1; i <= 5; i++) {
      expect(result.current.isWatched(i)).toBe(true);
    }
  });

  it("does not add duplicates", () => {
    const { result } = renderHook(() => useWatchlist());
    
    act(() => {
      result.current.addToWatchlist(1);
      result.current.addToWatchlist(1);
      result.current.addToWatchlist(1);
    });

    expect(result.current.watchlist.size).toBe(1);
  });
});
