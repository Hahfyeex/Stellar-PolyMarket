/**
 * optimisticBetsSlice.ts
 *
 * Redux slice for optimistic bet state management.
 *
 * Flow:
 *   1. addOptimisticBet  — immediately adds a bet with status "pending"
 *   2. confirmBet        — transitions status to "confirmed" on chain success
 *   3. rollbackBet       — removes the entry and stores the failure reason
 *
 * All state is visible in Redux DevTools under "optimisticBets".
 *
 * Design notes:
 *   - Keyed by a client-generated `optimisticId` (marketId + outcomeIndex + timestamp)
 *     so multiple bets on the same market can coexist during submission.
 *   - Failed entries are kept briefly (with status "failed") so the UI can
 *     show an error toast, then removed via clearFailedBet.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type BetStatus = "pending" | "confirmed" | "failed";

export interface OptimisticBet {
  /** Client-generated unique id */
  optimisticId: string;
  marketId: number;
  marketTitle: string;
  outcomeIndex: number;
  outcomeName: string;
  amount: number;
  status: BetStatus;
  /** ISO timestamp of when the bet was submitted */
  submittedAt: string;
  /** Populated on failure — shown in the error toast */
  failureReason: string | null;
}

interface OptimisticBetsState {
  bets: OptimisticBet[];
}

const initialState: OptimisticBetsState = {
  bets: [],
};

const optimisticBetsSlice = createSlice({
  name: "optimisticBets",
  initialState,
  reducers: {
    /**
     * Immediately add a bet with "pending" status.
     * Called before the transaction is submitted to the network.
     */
    addOptimisticBet(state, action: PayloadAction<Omit<OptimisticBet, "status" | "submittedAt" | "failureReason">>) {
      state.bets.push({
        ...action.payload,
        status: "pending",
        submittedAt: new Date().toISOString(),
        failureReason: null,
      });
    },

    /**
     * Mark a bet as confirmed after on-chain success.
     * The entry stays visible so the user sees the confirmed state briefly.
     */
    confirmBet(state, action: PayloadAction<{ optimisticId: string }>) {
      const bet = state.bets.find((b) => b.optimisticId === action.payload.optimisticId);
      if (bet) bet.status = "confirmed";
    },

    /**
     * Roll back a bet on transaction failure.
     * Sets status to "failed" and stores the reason for the error toast.
     * Call clearFailedBet after the toast has been shown.
     */
    rollbackBet(state, action: PayloadAction<{ optimisticId: string; reason: string }>) {
      const bet = state.bets.find((b) => b.optimisticId === action.payload.optimisticId);
      if (bet) {
        bet.status = "failed";
        bet.failureReason = action.payload.reason;
      }
    },

    /**
     * Remove a bet entry entirely.
     * Call after confirming (to clean up) or after showing the failure toast.
     */
    clearBet(state, action: PayloadAction<{ optimisticId: string }>) {
      state.bets = state.bets.filter((b) => b.optimisticId !== action.payload.optimisticId);
    },
  },
});

export const { addOptimisticBet, confirmBet, rollbackBet, clearBet } =
  optimisticBetsSlice.actions;

export default optimisticBetsSlice.reducer;
