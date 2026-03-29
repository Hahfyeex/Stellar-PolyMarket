import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTrendingMarkets } from "../useTrendingMarkets";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return Wrapper;
}

const TRENDING_MARKETS = [
  {
    market_id: 1,
    id: 1,
    question: "Will BTC reach $100k?",
    status: "ACTIVE",
    resolved: false,
    end_date: "2027-01-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    winning_outcome: null,
    total_pool: "5000",
    volume_24h: "1200.5",
    bet_count: 42,
  },
  {
    market_id: 2,
    id: 2,
    question: "Will ETH flip BTC?",
    status: "ACTIVE",
    resolved: false,
    end_date: "2027-06-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    winning_outcome: null,
    total_pool: "3000",
    volume_24h: "800",
    bet_count: 28,
  },
];

describe("useTrendingMarkets", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns loading state initially", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    const { result } = renderHook(() => useTrendingMarkets(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns trending markets on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markets: TRENDING_MARKETS }),
    }) as jest.Mock;

    const { result } = renderHook(() => useTrendingMarkets(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(TRENDING_MARKETS);
  });

  it("uses 60-second staleTime", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markets: TRENDING_MARKETS }),
    });
    global.fetch = fetchMock as jest.Mock;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }

    const { result: r1 } = renderHook(() => useTrendingMarkets(), { wrapper: Wrapper });
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));

    const { result: r2 } = renderHook(() => useTrendingMarkets(), { wrapper: Wrapper });
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    // Only one network request due to 60s staleTime caching
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sets isError on fetch failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock;
    const { result } = renderHook(() => useTrendingMarkets(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("calls the trending API endpoint", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markets: TRENDING_MARKETS }),
    }) as jest.Mock;

    renderHook(() => useTrendingMarkets(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/markets/trending"),
        expect.anything()
      );
    });
  });
});
