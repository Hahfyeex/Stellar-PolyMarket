/**
 * @jest-environment jsdom
 *
 * Unit tests for useBatchTransaction hook.
 * Covers: submitBatch, submitOperations, error parsing, rollback, Freighter interaction.
 *
 * The Stellar SDK is mocked so tests run without a real network or valid keypairs.
 */
import { renderHook, act } from "@testing-library/react";
import { useBatchTransaction } from "../useBatchTransaction";
import { QueuedBet } from "../../context/BettingSlipContext";

// ─── Mock @stellar/stellar-sdk ────────────────────────────────────────────────
// Prevents real keypair validation and network calls inside the hook.

const MOCK_XDR = "unsigned-xdr-base64";

jest.mock("@stellar/stellar-sdk", () => ({
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: () => MOCK_XDR }),
  })),
  Networks: { TESTNET: "Test SDF Network ; September 2015" },
  Operation: {
    payment: jest.fn().mockReturnValue({ type: "payment" }),
    changeTrust: jest.fn().mockReturnValue({ type: "changeTrust" }),
  },
  Asset: {
    native: jest.fn().mockReturnValue({ isNative: () => true }),
  },
  BASE_FEE: "100",
  xdr: {},
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNT = { id: "GABC1234", sequence: "1000" };
const SIGNED_XDR = "signed-xdr-string";
const HORIZON_SUCCESS = { hash: "abc123", successful: true };

const makeBet = (id = "1"): QueuedBet => ({
  id,
  marketId: Number(id),
  marketTitle: `Market ${id}`,
  outcomeIndex: 0,
  outcomeName: "Yes",
  amount: 10,
});

const makeOp = (type: "placeBet" | "addTrustline" | "payFee" = "placeBet") => ({
  type,
  operation: { type: "payment" } as any,
});

// ─── Setup ────────────────────────────────────────────────────────────────────

let freighterMock: { signTransaction: jest.Mock };

beforeEach(() => {
  // Mock Freighter wallet — set directly on global so the hook's `window.freighter` check works
  freighterMock = { signTransaction: jest.fn().mockResolvedValue(SIGNED_XDR) };
  (global as any).freighter = freighterMock;

  // Default fetch: account load + Horizon submit both succeed
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes("/accounts/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ACCOUNT) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(HORIZON_SUCCESS) });
  });
});

afterEach(() => {
  delete (global as any).freighter;
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useBatchTransaction", () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  it("initialises with idle state", () => {
    const { result } = renderHook(() => useBatchTransaction());
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBe(false);
  });

  // ── submitBatch: empty guard ───────────────────────────────────────────────

  it("submitBatch returns false immediately for empty bets array", async () => {
    const { result } = renderHook(() => useBatchTransaction());
    let ret!: boolean;
    await act(async () => { ret = await result.current.submitBatch([], "GABC1234"); });
    expect(ret).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── submitBatch: happy path ────────────────────────────────────────────────

  it("submitBatch succeeds end-to-end with 2 bets", async () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBatchTransaction(onSuccess));

    await act(async () => {
      await result.current.submitBatch([makeBet("1"), makeBet("2")], "GABC1234");
    });

    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Freighter called exactly once — atomic bundling
    expect(freighterMock.signTransaction).toHaveBeenCalledTimes(1);
    expect(freighterMock.signTransaction).toHaveBeenCalledWith(MOCK_XDR, { network: "TESTNET" });
  });

  // ── submitOperations: happy path ───────────────────────────────────────────

  it("submitOperations succeeds with [placeBet, addTrustline] batch", async () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBatchTransaction(onSuccess));

    await act(async () => {
      await result.current.submitOperations(
        [makeOp("placeBet"), makeOp("addTrustline")],
        "GABC1234"
      );
    });

    expect(result.current.success).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Single Freighter approval for 2 operations
    expect(freighterMock.signTransaction).toHaveBeenCalledTimes(1);
  });

  it("submitOperations succeeds with [placeBet, payFee] batch", async () => {
    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitOperations(
        [makeOp("placeBet"), makeOp("payFee")],
        "GABC1234"
      );
    });

    expect(result.current.success).toBe(true);
  });

  it("submitOperations returns false for empty ops array", async () => {
    const { result } = renderHook(() => useBatchTransaction());
    let ret!: boolean;
    await act(async () => { ret = await result.current.submitOperations([], "GABC1234"); });
    expect(ret).toBe(false);
  });

  // ── Freighter not installed ────────────────────────────────────────────────

  it("sets error when Freighter is not installed", async () => {
    delete (global as any).freighter; // remove freighter from global
    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.success).toBe(false);
    expect(result.current.error).toMatch(/Freighter wallet not installed/i);
  });

  // ── Account load failure ───────────────────────────────────────────────────

  it("sets error when Horizon account load fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: "Not Found",
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.success).toBe(false);
    expect(result.current.error).toMatch(/Failed to load account/i);
  });

  // ── Horizon submit failure + per-operation error parsing ──────────────────

  it("surfaces specific error message identifying which operation failed", async () => {
    // Account load succeeds
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_ACCOUNT) })
      // Horizon submit fails with operation-level result codes
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          extras: {
            result_codes: {
              transaction: "tx_failed",
              operations: ["op_success", "op_no_trust"],
            },
          },
        }),
      });

    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitOperations(
        [makeOp("placeBet"), makeOp("addTrustline")],
        "GABC1234"
      );
    });

    expect(result.current.success).toBe(false);
    // Error should name the failing operation and its code
    expect(result.current.error).toMatch(/Add Trustline/);
    expect(result.current.error).toMatch(/op no trust/i);
  });

  it("falls back to transaction-level error when no op codes present", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_ACCOUNT) })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          extras: { result_codes: { transaction: "tx_insufficient_balance" } },
        }),
      });

    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.error).toMatch(/tx_insufficient_balance/);
  });

  // ── Atomic rollback: no partial state ─────────────────────────────────────

  it("does not call onSuccess on failure (clean rollback)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_ACCOUNT) })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          extras: { result_codes: { transaction: "tx_failed", operations: [] } },
        }),
      });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBatchTransaction(onSuccess));

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.success).toBe(false);
  });

  // ── Freighter sign rejection ───────────────────────────────────────────────

  it("sets error when Freighter rejects the transaction", async () => {
    freighterMock.signTransaction.mockRejectedValueOnce(new Error("User declined"));

    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.success).toBe(false);
    expect(result.current.error).toMatch(/User declined/);
    // Horizon submit should NOT have been called (only account load happened)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ── onSuccess callback ─────────────────────────────────────────────────────

  it("calls onSuccess callback after successful submitOperations", async () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBatchTransaction(onSuccess));

    await act(async () => {
      await result.current.submitOperations([makeOp()], "GABC1234");
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onSuccess is not provided", async () => {
    const { result } = renderHook(() => useBatchTransaction());

    await expect(
      act(async () => {
        await result.current.submitBatch([makeBet()], "GABC1234");
      })
    ).resolves.not.toThrow();
  });

  // ── submitting flag ────────────────────────────────────────────────────────

  it("resets submitting to false after success", async () => {
    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.submitting).toBe(false);
  });

  it("resets submitting to false after failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: "Error",
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useBatchTransaction());

    await act(async () => {
      await result.current.submitBatch([makeBet()], "GABC1234");
    });

    expect(result.current.submitting).toBe(false);
  });
});
