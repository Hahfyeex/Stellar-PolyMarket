/**
 * Tests for optimistic bet state management.
 * Covers: addOptimisticBet, confirmBet, rollbackBet, clearBet (slice)
 *         + useOptimisticBet hook (add, confirm, rollback flows)
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import optimisticBetsReducer, {
  addOptimisticBet,
  confirmBet,
  rollbackBet,
  clearBet,
} from "../../store/optimisticBetsSlice";
import { useOptimisticBet } from "../../hooks/useOptimisticBet";
import {
  REFERRAL_STORAGE_KEY,
  generateReferralCode,
} from "../../lib/referral";

jest.mock("../../lib/stellar", () => ({
  validateStellarAddress: jest.fn(() => true),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { optimisticBets: optimisticBetsReducer } });
}

const SAMPLE_BET = {
  optimisticId: "1-0-1000",
  marketId: 1,
  marketTitle: "Will BTC hit $100k?",
  outcomeIndex: 0,
  outcomeName: "Yes",
  amount: 50,
};

// ── Slice unit tests ──────────────────────────────────────────────────────────

describe("optimisticBetsSlice", () => {
  it("initial state is empty", () => {
    const store = makeStore();
    expect(store.getState().optimisticBets.bets).toEqual([]);
  });

  it("addOptimisticBet adds a pending entry", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    const bets = store.getState().optimisticBets.bets;
    expect(bets).toHaveLength(1);
    expect(bets[0].status).toBe("pending");
    expect(bets[0].optimisticId).toBe("1-0-1000");
    expect(bets[0].failureReason).toBeNull();
    expect(bets[0].submittedAt).toBeTruthy();
  });

  it("confirmBet transitions status to confirmed", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    store.dispatch(confirmBet({ optimisticId: "1-0-1000" }));
    expect(store.getState().optimisticBets.bets[0].status).toBe("confirmed");
  });

  it("rollbackBet sets status to failed and stores reason", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    store.dispatch(rollbackBet({ optimisticId: "1-0-1000", reason: "Insufficient balance" }));
    const bet = store.getState().optimisticBets.bets[0];
    expect(bet.status).toBe("failed");
    expect(bet.failureReason).toBe("Insufficient balance");
  });

  it("clearBet removes the entry", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    store.dispatch(clearBet({ optimisticId: "1-0-1000" }));
    expect(store.getState().optimisticBets.bets).toHaveLength(0);
  });

  it("multiple bets can coexist", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet({ ...SAMPLE_BET, optimisticId: "1-0-1000" }));
    store.dispatch(addOptimisticBet({ ...SAMPLE_BET, optimisticId: "1-0-2000" }));
    expect(store.getState().optimisticBets.bets).toHaveLength(2);
  });

  it("confirmBet on unknown id is a no-op", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    store.dispatch(confirmBet({ optimisticId: "nonexistent" }));
    expect(store.getState().optimisticBets.bets[0].status).toBe("pending");
  });

  it("rollbackBet on unknown id is a no-op", () => {
    const store = makeStore();
    store.dispatch(addOptimisticBet(SAMPLE_BET));
    store.dispatch(rollbackBet({ optimisticId: "nonexistent", reason: "err" }));
    expect(store.getState().optimisticBets.bets[0].status).toBe("pending");
  });
});

// ── useOptimisticBet hook tests ───────────────────────────────────────────────

function HookHarness({ onResult }: { onResult: (r: boolean) => void }) {
  const { submitBet, optimisticBets } = useOptimisticBet();
  const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  return (
    <div>
      <div data-testid="bet-count">{optimisticBets.length}</div>
      {optimisticBets.map((b) => (
        <div key={b.optimisticId} data-testid={`status-${b.optimisticId}`}>
          {b.status}
        </div>
      ))}
      <button
        onClick={() =>
          submitBet(
            {
              marketId: 1,
              marketTitle: "Test Market",
              outcomeIndex: 0,
              outcomeName: "Yes",
              amount: 100,
              walletAddress,
            },
            (reason) => onResult(false)
          ).then(onResult)
        }
      >
        Submit
      </button>
    </div>
  );
}

function renderHook(onResult = jest.fn()) {
  const store = configureStore({
    reducer: { optimisticBets: optimisticBetsReducer },
  });
  const utils = render(
    <Provider store={store}>
      <HookHarness onResult={onResult} />
    </Provider>
  );
  return { ...utils, store };
}

describe("useOptimisticBet hook", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
  });

  it("optimistic add: bet appears immediately as pending", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as any; // hang
    const { store } = renderHook();

    act(() => {
      screen.getByRole("button").click();
    });

    await waitFor(() => {
      const bets = store.getState().optimisticBets.bets;
      expect(bets).toHaveLength(1);
      expect(bets[0].status).toBe("pending");
    });
  });

  it("confirm flow: status becomes confirmed on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bet: { id: 1 } }),
    }) as any;

    const onResult = jest.fn();
    const { store } = renderHook(onResult);

    act(() => { screen.getByRole("button").click(); });

    await waitFor(() => {
      const bets = store.getState().optimisticBets.bets;
      // Either confirmed (before clearBet timeout) or already cleared
      const statuses = bets.map((b) => b.status);
      expect(statuses.every((s) => s === "confirmed" || bets.length === 0)).toBe(true);
    });

    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("rollback flow: status becomes failed on API error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Insufficient balance" }),
    }) as any;

    const onResult = jest.fn();
    const { store } = renderHook(onResult);

    act(() => { screen.getByRole("button").click(); });

    await waitFor(() => {
      const bets = store.getState().optimisticBets.bets;
      if (bets.length > 0) {
        expect(bets[0].status).toBe("failed");
        expect(bets[0].failureReason).toBe("Insufficient balance");
      }
    });

    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("rollback flow: onError callback receives the failure reason", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Market is paused" }),
    }) as any;

    const onError = jest.fn();

    function ErrorHarness() {
      const { submitBet } = useOptimisticBet();
      return (
        <button
          onClick={() =>
            submitBet(
              {
                marketId: 2,
                marketTitle: "Q",
                outcomeIndex: 0,
                outcomeName: "Yes",
                amount: 10,
                walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
              },
              onError
            )
          }
        >
          go
        </button>
      );
    }

    const store = configureStore({ reducer: { optimisticBets: optimisticBetsReducer } });
    render(<Provider store={store}><ErrorHarness /></Provider>);
    act(() => { screen.getByRole("button").click(); });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Market is paused"));
  });

  it("betsForMarket filters by marketId", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as any;

    function MultiHarness() {
      const { submitBet, betsForMarket } = useOptimisticBet();
      const market1Bets = betsForMarket(1);
      const market2Bets = betsForMarket(2);
      return (
        <div>
          <div data-testid="m1">{market1Bets.length}</div>
          <div data-testid="m2">{market2Bets.length}</div>
          <button onClick={() => {
            submitBet({
              marketId: 1,
              marketTitle: "M1",
              outcomeIndex: 0,
              outcomeName: "Yes",
              amount: 10,
              walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            });
            submitBet({
              marketId: 2,
              marketTitle: "M2",
              outcomeIndex: 0,
              outcomeName: "No",
              amount: 20,
              walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            });
          }}>go</button>
        </div>
      );
    }

    const store = configureStore({ reducer: { optimisticBets: optimisticBetsReducer } });
    render(<Provider store={store}><MultiHarness /></Provider>);
    act(() => { screen.getByRole("button").click(); });

    await waitFor(() => {
      expect(screen.getByTestId("m1").textContent).toBe("1");
      expect(screen.getByTestId("m2").textContent).toBe("1");
    });
  });

  it("includes the stored referral code only on the first successful bet for a wallet", async () => {
    const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const ownReferralCode = generateReferralCode(walletAddress);
    expect(ownReferralCode).toHaveLength(8);

    localStorage.setItem(REFERRAL_STORAGE_KEY, "REF12345");

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bet: { id: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bet: { id: 2 } }),
      }) as any;

    function AttributionHarness() {
      const { submitBet } = useOptimisticBet();

      return (
        <button
          onClick={async () => {
            await submitBet({
              marketId: 1,
              marketTitle: "Market A",
              outcomeIndex: 0,
              outcomeName: "Yes",
              amount: 10,
              walletAddress,
            });
            await submitBet({
              marketId: 2,
              marketTitle: "Market B",
              outcomeIndex: 1,
              outcomeName: "No",
              amount: 12,
              walletAddress,
            });
          }}
        >
          attribute
        </button>
      );
    }

    const store = configureStore({ reducer: { optimisticBets: optimisticBetsReducer } });
    render(
      <Provider store={store}>
        <AttributionHarness />
      </Provider>
    );

    act(() => {
      screen.getByRole("button", { name: "attribute" }).click();
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    const firstRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const secondRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);

    expect(firstRequest.referralCode).toBe("REF12345");
    expect(secondRequest.referralCode).toBeUndefined();
    expect(
      localStorage.getItem(`stella.referral.attributed:${walletAddress.toUpperCase()}`)
    ).toBe("true");
  });
});
