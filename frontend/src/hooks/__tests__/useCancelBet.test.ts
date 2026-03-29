/**
 * useCancelBet.test.ts
 *
 * Tests for bet cancellation mutation:
 *   - Successful cancellation with refund
 *   - Error handling (grace period expired, already cancelled, etc.)
 *   - Query cache invalidation
 *   - Wallet address validation
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCancelBet } from "../useCancelBet";
import React, { ReactNode } from "react";

// Mock fetch
global.fetch = jest.fn();

describe("useCancelBet", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("throws error when walletAddress is null", async () => {
    const { result } = renderHook(() => useCancelBet(null), { wrapper });

    await waitFor(() => {
      expect(result.current.mutate).toBeDefined();
    });

    result.current.mutate(123);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain("Wallet address required");
    });
  });

  it("successfully cancels a bet and returns refund amount", async () => {
    const mockResponse = {
      success: true,
      bet_id: 123,
      refunded_amount: "100.50",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.isPending).toBe(false);
    });
  });

  it("handles grace period expired error", async () => {
    const mockError = {
      error: "Grace period has expired",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockError,
    });

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain("Grace period");
    });
  });

  it("handles already cancelled error", async () => {
    const mockError = {
      error: "Bet already cancelled",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => mockError,
    });

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain("already cancelled");
    });
  });

  it("handles network error gracefully", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it("invalidates bets query on success", async () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const mockResponse = {
      success: true,
      bet_id: 123,
      refunded_amount: "100.50",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["bets"] }));
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["portfolio"] })
      );
    });

    invalidateSpy.mockRestore();
  });

  it("sends correct DELETE request with wallet address", async () => {
    const mockResponse = {
      success: true,
      bet_id: 123,
      refunded_amount: "100.50",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/bets/123"),
        expect.objectContaining({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: "GABC123" }),
        })
      );
    });
  });

  it("sets isPending to true during mutation", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  success: true,
                  bet_id: 123,
                  refunded_amount: "100.50",
                }),
              }),
            100
          )
        )
    );

    const { result } = renderHook(() => useCancelBet("GABC123"), { wrapper });

    result.current.mutate(123);

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
