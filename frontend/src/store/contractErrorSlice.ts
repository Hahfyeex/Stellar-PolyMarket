/**
 * contractErrorSlice.ts
 *
 * Redux slice for tracking Soroban contract errors globally.
 * Errors dispatched here are visible in Redux DevTools under
 * the "contractError" key.
 *
 * Actions:
 *   setContractError(payload) — store an error (from ErrorBoundary)
 *   clearContractError()      — reset after retry or dismiss
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ContractErrorState {
  /** Serialisable error info (Error objects can't go in Redux) */
  code: string | null;
  message: string | null;
  /** ISO timestamp of when the error was captured */
  capturedAt: string | null;
  /** Component or context that threw */
  context: string | null;
}

const initialState: ContractErrorState = {
  code: null,
  message: null,
  capturedAt: null,
  context: null,
};

const contractErrorSlice = createSlice({
  name: "contractError",
  initialState,
  reducers: {
    setContractError(
      state,
      action: PayloadAction<{ message: string; context?: string }>
    ) {
      state.message = action.payload.message;
      state.context = action.payload.context ?? null;
      state.capturedAt = new Date().toISOString();
      // Extract a short code from the message for DevTools readability
      const match = action.payload.message.match(/Error\(Contract, #\d+\)|op_\w+/);
      state.code = match ? match[0] : "UNKNOWN";
    },
    clearContractError(state) {
      state.code = null;
      state.message = null;
      state.capturedAt = null;
      state.context = null;
    },
  },
});

export const { setContractError, clearContractError } = contractErrorSlice.actions;
export default contractErrorSlice.reducer;
