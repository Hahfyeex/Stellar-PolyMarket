import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useMarkets } from "../useMarkets";
import { useMarket } from "../useMarket";
import { usePlaceBet } from "../usePlaceBet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return Wrapper;
}

const MARKETS = [
  {
    id: 1,
    question: "Q1",
    end_date: "2027-01-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "100",
    status: "open",
  },
  {
    id: 2,
    question: "Q2",
    end_date: "2027-06-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: true,
    winning_outcome: 0,
    total_pool: "200",
    status: "RESOLVED",
  },
];

const MARKET_DETAIL = {
  market: {
    id: 1,
    question: "Q1",
    end_date: "2027-01-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "100",
    status: "open",
    contract_address: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  bets: [
    {
      id: 1,
      wallet_address: "GABC",
      outcome_index: 0,
      amount: "50",
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// useMarkets
// ---------------------------------------------------------------------------

describe("useMarkets", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns loading state initially", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    const { result } = renderHook(() => useMarkets(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns markets on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markets: MARKETS }),
    }) as jest.Mock;

    const { result } = renderHook(() => useMarkets(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(MARKETS);
  });

  it("returns cached data on subsequent renders without a new network request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markets: MARKETS }),
    });
    global.fetch = fetchMock as jest.Mock;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }

    const { result: r1 } = renderHook(() => useMarkets(), { wrapper: Wrapper });
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));

    const { result: r2 } = renderHook(() => useMarkets(), { wrapper: Wrapper });
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    // Only one network request despite two hook renders
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r2.current.data).toEqual(MARKETS);
  });

  it("sets isError on fetch failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock;
    const { result } = renderHook(() => useMarkets(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useMarket
// ---------------------------------------------------------------------------

describe("useMarket", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns loading state initially", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    const { result } = renderHook(() => useMarket("1"), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns market detail on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => MARKET_DETAIL,
    }) as jest.Mock;

    const { result } = renderHook(() => useMarket("1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(MARKET_DETAIL);
  });

  it("sets isError on fetch failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Not found" }),
    }) as jest.Mock;

    const { result } = renderHook(() => useMarket("99"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Not found");
  });

  it("does not fetch when id is empty", () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as jest.Mock;
    renderHook(() => useMarket(""), { wrapper: makeWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePlaceBet
// ---------------------------------------------------------------------------

describe("usePlaceBet", () => {
  beforeEach(() => jest.resetAllMocks());

  const betInput = { marketId: 1, outcomeIndex: 0, amount: 50, walletAddress: "GABC" };

  it("is idle initially", () => {
    const { result } = renderHook(() => usePlaceBet(1), { wrapper: makeWrapper() });
    expect(result.current.isIdle).toBe(true);
  });

  it("calls POST /api/bets and returns success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bet: { id: 10 } }),
    }) as jest.Mock;

    const { result } = renderHook(() => usePlaceBet(1), { wrapper: makeWrapper() });
    result.current.mutate(betInput);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bets"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("invalidates markets and market queries on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bet: { id: 10 } }),
    }) as jest.Mock;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    function Wrapper1({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }

    const { result } = renderHook(() => usePlaceBet(1), { wrapper: Wrapper1 });
    result.current.mutate(betInput);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["markets"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["market", "1"] });
  });

  it("sets isError on API failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Insufficient funds" }),
    }) as jest.Mock;

    const { result } = renderHook(() => usePlaceBet(1), { wrapper: makeWrapper() });
    result.current.mutate(betInput);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Insufficient funds");
  });

  it("invalidates only markets query when no marketId provided", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bet: { id: 11 } }),
    }) as jest.Mock;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    function Wrapper2({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }

    const { result } = renderHook(() => usePlaceBet(), { wrapper: Wrapper2 });
    result.current.mutate(betInput);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["markets"] });
    // market-specific invalidation should NOT be called
    const marketCalls = invalidateSpy.mock.calls.filter(
      (c) => Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === "market"
    );
    expect(marketCalls).toHaveLength(0);
  });

  it("falls back to generic error message when API returns no error field", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as jest.Mock;

    const { result } = renderHook(() => usePlaceBet(1), { wrapper: makeWrapper() });
    result.current.mutate(betInput);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Failed to place bet");
  });
});
