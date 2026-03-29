/**
 * @jest-environment jsdom
 *
 * Unit tests for useIPFSMetadata hook.
 *
 * Coverage targets (>90%):
 *  - fetchIPFSMetadata: success (object), success (JSON string), schema failure,
 *                       null response, AbortError → IPFS_TIMEOUT, generic error,
 *                       sourceUrls not array
 *  - useIPFSMetadata: IPFS success, timeout → on-chain fallback,
 *                     timeout with empty on-chain, timeout with no fallback,
 *                     generic error, no CID (null/undefined/""), cache dedup,
 *                     separate CIDs fetched independently
 *  - createPinataClient smoke test
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  fetchIPFSMetadata,
  useIPFSMetadata,
  createPinataClient,
  IPFSMetadata,
  OnChainFallback,
} from "../useIPFSMetadata";

// ─── Mock the pinata npm package ─────────────────────────────────────────────
// Intercepts new PinataSDK({...}) calls made inside createPinataClient().

const mockGatewaysGet = jest.fn();

jest.mock("pinata", () => ({
  PinataSDK: jest.fn().mockImplementation(() => ({
    gateways: { get: mockGatewaysGet },
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CID = "QmValidCid123";

const VALID_METADATA: IPFSMetadata = {
  description: "Will ETH hit $10k by end of 2025?",
  category: "Crypto",
  sourceUrls: ["https://example.com/source1", "https://example.com/source2"],
  creatorNotes: "Based on CoinGecko price feed.",
};

const ON_CHAIN: OnChainFallback = {
  description: "On-chain description fallback",
  category: "Finance",
};

// ─── React Query wrapper factory ──────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

// ─── fetchIPFSMetadata (unit) ─────────────────────────────────────────────────

describe("fetchIPFSMetadata", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns parsed metadata when gateway resolves with a valid object", async () => {
    mockGatewaysGet.mockResolvedValueOnce(VALID_METADATA);
    const result = await fetchIPFSMetadata(VALID_CID);
    expect(result).toEqual(VALID_METADATA);
    expect(mockGatewaysGet).toHaveBeenCalledWith(VALID_CID);
  });

  it("parses a JSON string returned by the gateway", async () => {
    mockGatewaysGet.mockResolvedValueOnce(JSON.stringify(VALID_METADATA));
    const result = await fetchIPFSMetadata(VALID_CID);
    expect(result).toEqual(VALID_METADATA);
  });

  it("throws when the gateway returns an object missing required fields", async () => {
    mockGatewaysGet.mockResolvedValueOnce({ description: "only this" });
    await expect(fetchIPFSMetadata(VALID_CID)).rejects.toThrow(
      "IPFS response does not match expected metadata schema"
    );
  });

  it("throws when the gateway returns null", async () => {
    mockGatewaysGet.mockResolvedValueOnce(null);
    await expect(fetchIPFSMetadata(VALID_CID)).rejects.toThrow();
  });

  it("throws IPFS_TIMEOUT when the gateway does not respond within 5 s", async () => {
    jest.useFakeTimers();
    // Return a promise that never resolves (simulates a hung gateway).
    mockGatewaysGet.mockReturnValueOnce(new Promise(() => {}));

    const pendingFetch = fetchIPFSMetadata(VALID_CID);
    // Advance past the 5 s timeout window.
    jest.advanceTimersByTime(5001);

    await expect(pendingFetch).rejects.toThrow("IPFS_TIMEOUT");
    jest.useRealTimers();
  });

  it("rethrows non-timeout errors unchanged", async () => {
    mockGatewaysGet.mockRejectedValueOnce(new Error("Network failure"));
    await expect(fetchIPFSMetadata(VALID_CID)).rejects.toThrow("Network failure");
  });

  it("throws when sourceUrls is not an array", async () => {
    mockGatewaysGet.mockResolvedValueOnce({
      ...VALID_METADATA,
      sourceUrls: "not-an-array",
    });
    await expect(fetchIPFSMetadata(VALID_CID)).rejects.toThrow(
      "IPFS response does not match expected metadata schema"
    );
  });
});

// ─── useIPFSMetadata (integration with React Query) ──────────────────────────

describe("useIPFSMetadata", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Happy path: IPFS resolves ──────────────────────────────────────────────

  it("returns metadata and isLoading=false when IPFS resolves successfully", async () => {
    mockGatewaysGet.mockResolvedValueOnce(VALID_METADATA);

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata).toEqual(VALID_METADATA);
    expect(result.current.isUnavailable).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Timeout → on-chain fallback ───────────────────────────────────────────

  it("falls back to on-chain data when IPFS times out (IPFS_TIMEOUT error)", async () => {
    // Reject with the same sentinel message the timeout promise emits.
    mockGatewaysGet.mockRejectedValueOnce(new Error("IPFS_TIMEOUT"));

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID, ON_CHAIN),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata).toEqual({
      description: ON_CHAIN.description,
      category: ON_CHAIN.category,
      sourceUrls: [],
      creatorNotes: "",
    });
    expect(result.current.isUnavailable).toBe(false);
  });

  it("fills empty strings when onChain fallback has no description or category", async () => {
    mockGatewaysGet.mockRejectedValueOnce(new Error("IPFS_TIMEOUT"));

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID, {}),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata).toEqual({
      description: "",
      category: "",
      sourceUrls: [],
      creatorNotes: "",
    });
  });

  // ── Both sources fail → isUnavailable ─────────────────────────────────────

  it("returns null metadata when IPFS times out and no on-chain fallback is provided", async () => {
    mockGatewaysGet.mockRejectedValueOnce(new Error("IPFS_TIMEOUT"));

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID), // no onChain arg
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata).toBeNull();
    expect(result.current.isUnavailable).toBe(true);
  });

  it("returns null and isUnavailable when IPFS throws a generic (non-timeout) error", async () => {
    mockGatewaysGet.mockRejectedValueOnce(new Error("gateway 503"));

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID, ON_CHAIN),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Generic errors do NOT trigger the on-chain fallback
    expect(result.current.metadata).toBeNull();
    expect(result.current.isUnavailable).toBe(true);
  });

  it("returns null when IPFS returns data that fails schema validation", async () => {
    mockGatewaysGet.mockResolvedValueOnce({ bad: "schema" });

    const { result } = renderHook(
      () => useIPFSMetadata(VALID_CID),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata).toBeNull();
    expect(result.current.isUnavailable).toBe(true);
  });

  // ── No CID (disabled query) ────────────────────────────────────────────────

  it("does not fetch and returns isUnavailable when cid is null", () => {
    const { result } = renderHook(
      () => useIPFSMetadata(null),
      { wrapper: makeWrapper() }
    );

    // Disabled query: not loading, not fetching
    expect(result.current.isLoading).toBe(false);
    expect(result.current.metadata).toBeNull();
    expect(result.current.isUnavailable).toBe(true);
    expect(mockGatewaysGet).not.toHaveBeenCalled();
  });

  it("does not fetch when cid is undefined", () => {
    const { result } = renderHook(
      () => useIPFSMetadata(undefined),
      { wrapper: makeWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
    expect(mockGatewaysGet).not.toHaveBeenCalled();
  });

  it("does not fetch when cid is an empty string", () => {
    const { result } = renderHook(
      () => useIPFSMetadata(""),
      { wrapper: makeWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
    expect(mockGatewaysGet).not.toHaveBeenCalled();
  });

  // ── Caching: same CID fetched only once per shared QueryClient ────────────

  it("fetches the CID only once when two hooks share the same QueryClient", async () => {
    mockGatewaysGet.mockResolvedValue(VALID_METADATA);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const hook1 = renderHook(() => useIPFSMetadata(VALID_CID), { wrapper: Wrapper });
    const hook2 = renderHook(() => useIPFSMetadata(VALID_CID), { wrapper: Wrapper });

    await waitFor(() => expect(hook1.result.current.isLoading).toBe(false));
    await waitFor(() => expect(hook2.result.current.isLoading).toBe(false));

    expect(hook1.result.current.metadata).toEqual(VALID_METADATA);
    expect(hook2.result.current.metadata).toEqual(VALID_METADATA);
    // React Query deduplication → gateway called exactly once
    expect(mockGatewaysGet).toHaveBeenCalledTimes(1);
  });

  // ── Different CIDs use separate cache entries ─────────────────────────────

  it("fetches separately for different CIDs", async () => {
    const meta2: IPFSMetadata = { ...VALID_METADATA, category: "Politics" };
    mockGatewaysGet
      .mockResolvedValueOnce(VALID_METADATA)
      .mockResolvedValueOnce(meta2);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const hook1 = renderHook(() => useIPFSMetadata("Qm111"), { wrapper: Wrapper });
    const hook2 = renderHook(() => useIPFSMetadata("Qm222"), { wrapper: Wrapper });

    await waitFor(() => expect(hook1.result.current.isLoading).toBe(false));
    await waitFor(() => expect(hook2.result.current.isLoading).toBe(false));

    expect(hook1.result.current.metadata?.category).toBe("Crypto");
    expect(hook2.result.current.metadata?.category).toBe("Politics");
    expect(mockGatewaysGet).toHaveBeenCalledTimes(2);
  });
});

// ─── createPinataClient (smoke test) ──────────────────────────────────────────

describe("createPinataClient", () => {
  it("returns a client with a gateways property", () => {
    const client = createPinataClient();
    expect(client).toHaveProperty("gateways");
  });
});
