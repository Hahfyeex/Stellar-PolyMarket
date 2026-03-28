/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useMarketTabs } from "../useMarketTabs";
import type { Market } from "../../types/market";

// Helpers
const makeMarket = (overrides: Partial<Market> & { id: number }): Market => ({
  question: `Market ${overrides.id}`,
  end_date: "2099-01-01T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "100",
  ...overrides,
});

const FUTURE = "2099-06-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

const MARKETS: Market[] = [
  makeMarket({ id: 1, resolved: false, end_date: "2099-03-01T00:00:00Z" }),
  makeMarket({ id: 2, resolved: false, end_date: "2099-01-01T00:00:00Z" }),
  makeMarket({ id: 3, resolved: true, end_date: PAST, finalized_at: "2024-06-01T00:00:00Z" }),
  makeMarket({ id: 4, resolved: true, end_date: PAST, finalized_at: "2024-01-01T00:00:00Z" }),
  // expired but not resolved — should NOT appear in active tab
  makeMarket({ id: 5, resolved: false, end_date: PAST }),
];

describe("useMarketTabs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to active tab", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    expect(result.current.activeTab).toBe("active");
  });

  it("restores tab from localStorage", () => {
    localStorage.setItem("marketListActiveTab", "resolved");
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    expect(result.current.activeTab).toBe("resolved");
  });

  it("persists tab change to localStorage", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    act(() => result.current.setActiveTab("resolved"));
    expect(localStorage.getItem("marketListActiveTab")).toBe("resolved");
  });

  it("activeMarkets contains only unresolved markets with future end_date", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    const ids = result.current.activeMarkets.map((m) => m.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // resolved
    expect(ids).not.toContain(4); // resolved
    expect(ids).not.toContain(5); // expired
  });

  it("activeMarkets are sorted by end_date ascending (soonest first)", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    const dates = result.current.activeMarkets.map((m) => m.end_date);
    const sorted = [...dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    expect(dates).toEqual(sorted);
  });

  it("resolvedMarkets contains only resolved markets", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    const ids = result.current.resolvedMarkets.map((m) => m.id);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(5);
  });

  it("resolvedMarkets are sorted by finalized_at descending (most recent first)", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    const ids = result.current.resolvedMarkets.map((m) => m.id);
    // id:3 finalized 2024-06-01, id:4 finalized 2024-01-01 → id:3 first
    expect(ids[0]).toBe(3);
    expect(ids[1]).toBe(4);
  });

  it("badge counts match list lengths", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    expect(result.current.activeBadge).toBe(result.current.activeMarkets.length);
    expect(result.current.resolvedBadge).toBe(result.current.resolvedMarkets.length);
  });

  it("badge counts are correct values", () => {
    const { result } = renderHook(() => useMarketTabs(MARKETS));
    expect(result.current.activeBadge).toBe(2);
    expect(result.current.resolvedBadge).toBe(2);
  });

  it("updates badge counts when markets change", () => {
    const { result, rerender } = renderHook(
      ({ markets }) => useMarketTabs(markets),
      { initialProps: { markets: MARKETS } }
    );
    expect(result.current.activeBadge).toBe(2);

    const newMarkets = [
      ...MARKETS,
      makeMarket({ id: 99, resolved: false, end_date: FUTURE }),
    ];
    rerender({ markets: newMarkets });
    expect(result.current.activeBadge).toBe(3);
  });

  it("handles empty markets array", () => {
    const { result } = renderHook(() => useMarketTabs([]));
    expect(result.current.activeMarkets).toHaveLength(0);
    expect(result.current.resolvedMarkets).toHaveLength(0);
    expect(result.current.activeBadge).toBe(0);
    expect(result.current.resolvedBadge).toBe(0);
  });

  it("falls back to end_date for resolved sort when finalized_at is absent", () => {
    const markets: Market[] = [
      makeMarket({ id: 10, resolved: true, end_date: "2023-06-01T00:00:00Z" }),
      makeMarket({ id: 11, resolved: true, end_date: "2023-01-01T00:00:00Z" }),
    ];
    const { result } = renderHook(() => useMarketTabs(markets));
    const ids = result.current.resolvedMarkets.map((m) => m.id);
    // id:10 end_date is later → should come first (descending)
    expect(ids[0]).toBe(10);
  });
});
