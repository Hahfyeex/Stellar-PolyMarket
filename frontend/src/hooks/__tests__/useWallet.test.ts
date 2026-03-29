/**
 * Tests for useWallet hook — Freighter wallet rejection fix
 *
 * Task 1: Bug condition exploration tests (expected to fail on UNFIXED code)
 * Task 2: Preservation property tests (expected to pass on both fixed and unfixed code)
 *
 * Bug condition: getPublicKey throws a plain string → err.message === undefined
 * → walletError set to undefined, isLoading stuck as true
 *
 * Fix: normalise thrown value, detect rejection strings, always reset isLoading
 */
import { renderHook, act } from "@testing-library/react";
import { useWallet } from "../useWallet";

// ── Freighter mock helpers ────────────────────────────────────────────────────

function mockFreighter(overrides: Partial<typeof window.freighter> = {}) {
  Object.defineProperty(window, "freighter", {
    writable: true,
    configurable: true,
    value: {
      getPublicKey: jest.fn().mockResolvedValue("GABCDEF1234567890"),
      isConnected: jest.fn().mockResolvedValue(true),
      signTransaction: jest.fn(),
      ...overrides,
    },
  });
}

function removeFreighter() {
  Object.defineProperty(window, "freighter", {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Task 1: Bug condition exploration tests ───────────────────────────────────
// These tests encode the EXPECTED (fixed) behavior.
// On UNFIXED code they FAIL because err.message on a string is undefined.
// After the fix they PASS, confirming the bug is resolved.

describe("Bug Condition: string thrown by getPublicKey produces user-readable walletError", () => {
  it('throws "User rejected" → sets cancellation message, isLoading false', async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("User rejected"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    // Counterexample on unfixed code: error is undefined (err.message on string === undefined)
    expect(result.current.walletError).toBe(
      "Connection cancelled. Click Connect Wallet to try again."
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('throws "Transaction denied by user" → sets cancellation message, isLoading false', async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("Transaction denied by user"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBe(
      "Connection cancelled. Click Connect Wallet to try again."
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('throws "network timeout" (non-rejection string) → sets generic error, isLoading false', async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("network timeout"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBe(
      "Failed to connect wallet. Please try again."
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("rejection string matching is case-insensitive", async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("USER REJECTED"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBe(
      "Connection cancelled. Click Connect Wallet to try again."
    );
  });

  it('"denied" in error string → sets cancellation message', async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("Access denied"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBe(
      "Connection cancelled. Click Connect Wallet to try again."
    );
  });
});

// ── Task 2: Preservation property tests ──────────────────────────────────────
// These tests verify unchanged behavior — must pass on both fixed and unfixed code.

describe("Preservation: non-string-throw paths produce unchanged state", () => {
  it("successful connection sets publicKey, clears walletError, isLoading false", async () => {
    const testKey = "GABCDEF1234567890TESTKEY";
    mockFreighter({
      getPublicKey: jest.fn().mockResolvedValue(testKey),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(testKey);
    expect(result.current.walletError).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("Freighter not installed → sets not-installed error, isLoading false", async () => {
    removeFreighter();
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toContain("Freighter wallet not installed");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.publicKey).toBeNull();
  });

  it("Freighter locked (isConnected false) → sets unlock error, isLoading false", async () => {
    mockFreighter({
      isConnected: jest.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toContain("unlock");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.publicKey).toBeNull();
  });

  it("Error object thrown by getPublicKey → sets generic error message, isLoading false", async () => {
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue(new Error("unexpected failure")),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBe("Failed to connect wallet. Please try again.");
    expect(result.current.isLoading).toBe(false);
  });

  it("disconnect clears publicKey without affecting error state", async () => {
    const testKey = "GABCDEF1234567890TESTKEY";
    mockFreighter({
      getPublicKey: jest.fn().mockResolvedValue(testKey),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(testKey);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.walletError).toBeNull(); // error unchanged (was null)
  });

  it("isLoading starts as false before connect is called", () => {
    mockFreighter();
    const { result } = renderHook(() => useWallet());
    expect(result.current.isLoading).toBe(false);
  });

  it("publicKey starts as null", () => {
    mockFreighter();
    const { result } = renderHook(() => useWallet());
    expect(result.current.publicKey).toBeNull();
  });

  it("walletError starts as null", () => {
    mockFreighter();
    const { result } = renderHook(() => useWallet());
    expect(result.current.walletError).toBeNull();
  });

  it("previous error is cleared on new connect attempt", async () => {
    // First attempt fails
    mockFreighter({
      getPublicKey: jest.fn().mockRejectedValue("network timeout"),
    });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.walletError).not.toBeNull();

    // Second attempt succeeds
    (window.freighter!.getPublicKey as jest.Mock).mockResolvedValue("GNEWKEY");
    (window.freighter!.isConnected as jest.Mock).mockResolvedValue(true);

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.walletError).toBeNull();
    expect(result.current.publicKey).toBe("GNEWKEY");
  });
});
