/**
 * Tests for ContractErrorBoundary + contractErrorSlice + contractErrors mapping
 * Target: >90% coverage across all three modules
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { configureStore } from "@reduxjs/toolkit";
import ContractErrorBoundary from "../ContractErrorBoundary";
import contractErrorReducer, {
  setContractError,
  clearContractError,
} from "../../store/contractErrorSlice";
import {
  mapContractError,
  CONTRACT_ERROR_MAP,
  DEFAULT_CONTRACT_ERROR,
} from "../../constants/contractErrors";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { contractError: contractErrorReducer } });
}

/** Component that throws on first render, then renders normally after retry */
function ThrowOnce({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Error(Contract, #2)");
  return <div data-testid="child">OK</div>;
}

/** Wrapper that controls the throw */
function BoundaryWithToggle({ store }: { store: ReturnType<typeof makeStore> }) {
  const [throwing, setThrowing] = React.useState(true);
  return (
    <ContractErrorBoundary context="TestComponent" store={store}>
      <ThrowOnce shouldThrow={throwing} />
      {/* Expose toggle for tests — not rendered when boundary catches */}
      <button onClick={() => setThrowing(false)} style={{ display: "none" }} />
    </ContractErrorBoundary>
  );
}

// Suppress React's error boundary console.error noise in tests
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

// ── ContractErrorBoundary rendering ──────────────────────────────────────────

describe("ContractErrorBoundary", () => {
  it("renders children when no error", () => {
    const store = makeStore();
    render(
      <ContractErrorBoundary store={store}>
        <div data-testid="child">OK</div>
      </ContractErrorBoundary>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    expect(screen.getByTestId("contract-error-boundary")).toBeInTheDocument();
  });

  it("shows mapped title for known error code", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    // Error(Contract, #2) → "Bet Too Small"
    expect(screen.getByText("Bet Too Small")).toBeInTheDocument();
  });

  it("shows mapped message for known error code", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    expect(screen.getByText(/below the minimum required/i)).toBeInTheDocument();
  });

  it("shows Retry button for retryable errors", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    expect(screen.getByTestId("retry-button")).toBeInTheDocument();
  });

  it("retry button resets error state and re-renders children", () => {
    const store = makeStore();
    // Render a boundary where the child stops throwing after first render
    let throwCount = 0;
    function ThrowOnce2() {
      if (throwCount === 0) { throwCount++; throw new Error("Error(Contract, #2)"); }
      return <div data-testid="recovered">Recovered</div>;
    }
    render(
      <ContractErrorBoundary store={store}>
        <ThrowOnce2 />
      </ContractErrorBoundary>
    );
    expect(screen.getByTestId("contract-error-boundary")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("retry-button"));
    expect(screen.getByTestId("recovered")).toBeInTheDocument();
  });

  it("hides Retry button for non-retryable errors", () => {
    const store = makeStore();
    function ThrowNonRetryable() {
      throw new Error("Error(Contract, #1)"); // Market Already Resolved — retryable: false
    }
    render(
      <ContractErrorBoundary store={store}>
        <ThrowNonRetryable />
      </ContractErrorBoundary>
    );
    expect(screen.queryByTestId("retry-button")).not.toBeInTheDocument();
  });

  it("dispatches setContractError to Redux store on error", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    const state = store.getState().contractError;
    expect(state.message).toContain("Error(Contract, #2)");
    expect(state.context).toBe("TestComponent");
    expect(state.capturedAt).not.toBeNull();
  });

  it("works without a store prop (no dispatch crash)", () => {
    render(
      <ContractErrorBoundary>
        <ThrowOnce shouldThrow />
      </ContractErrorBoundary>
    );
    expect(screen.getByTestId("contract-error-boundary")).toBeInTheDocument();
  });

  it("shows default fallback for unknown error codes", () => {
    function ThrowUnknown() { throw new Error("some random error"); }
    render(
      <ContractErrorBoundary>
        <ThrowUnknown />
      </ContractErrorBoundary>
    );
    expect(screen.getByText("Contract Error")).toBeInTheDocument();
  });

  it("shows technical details section", () => {
    const store = makeStore();
    render(<BoundaryWithToggle store={store} />);
    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });
});

// ── contractErrorSlice ────────────────────────────────────────────────────────

describe("contractErrorSlice", () => {
  it("initial state is all null", () => {
    const store = makeStore();
    const state = store.getState().contractError;
    expect(state.code).toBeNull();
    expect(state.message).toBeNull();
    expect(state.capturedAt).toBeNull();
    expect(state.context).toBeNull();
  });

  it("setContractError stores message and context", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "Error(Contract, #5)", context: "BettingSlip" }));
    const state = store.getState().contractError;
    expect(state.message).toBe("Error(Contract, #5)");
    expect(state.context).toBe("BettingSlip");
  });

  it("setContractError extracts code from message", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "Error(Contract, #3)" }));
    expect(store.getState().contractError.code).toBe("Error(Contract, #3)");
  });

  it("setContractError sets code to UNKNOWN for unrecognised messages", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "something random" }));
    expect(store.getState().contractError.code).toBe("UNKNOWN");
  });

  it("setContractError sets capturedAt timestamp", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "op_no_trust" }));
    expect(store.getState().contractError.capturedAt).not.toBeNull();
  });

  it("clearContractError resets all fields", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "Error(Contract, #1)", context: "Test" }));
    store.dispatch(clearContractError());
    const state = store.getState().contractError;
    expect(state.code).toBeNull();
    expect(state.message).toBeNull();
    expect(state.context).toBeNull();
    expect(state.capturedAt).toBeNull();
  });

  it("context defaults to null when not provided", () => {
    const store = makeStore();
    store.dispatch(setContractError({ message: "Error(Contract, #2)" }));
    expect(store.getState().contractError.context).toBeNull();
  });
});

// ── mapContractError ──────────────────────────────────────────────────────────

describe("mapContractError", () => {
  it("maps Error(Contract, #1) to Market Already Resolved", () => {
    const info = mapContractError(new Error("Error(Contract, #1)"));
    expect(info.title).toBe("Market Already Resolved");
    expect(info.retryable).toBe(false);
  });

  it("maps Error(Contract, #2) to Bet Too Small", () => {
    expect(mapContractError(new Error("Error(Contract, #2)")).title).toBe("Bet Too Small");
  });

  it("maps Error(Contract, #3) to Market Expired", () => {
    expect(mapContractError(new Error("Error(Contract, #3)")).title).toBe("Market Expired");
  });

  it("maps Error(Contract, #4) to Not Authorised", () => {
    expect(mapContractError(new Error("Error(Contract, #4)")).title).toBe("Not Authorised");
  });

  it("maps Error(Contract, #5) to Insufficient Balance", () => {
    expect(mapContractError(new Error("Error(Contract, #5)")).title).toBe("Insufficient Balance");
  });

  it("maps op_no_trust to Trustline Required", () => {
    expect(mapContractError(new Error("op_no_trust")).title).toBe("Trustline Required");
  });

  it("maps User declined access to Transaction Rejected", () => {
    expect(mapContractError(new Error("User declined access")).title).toBe("Transaction Rejected");
  });

  it("returns DEFAULT_CONTRACT_ERROR for unknown codes", () => {
    const info = mapContractError(new Error("totally unknown error xyz"));
    expect(info).toEqual(DEFAULT_CONTRACT_ERROR);
  });

  it("all mapped errors have title and message", () => {
    for (const [, info] of Object.entries(CONTRACT_ERROR_MAP)) {
      expect(info.title).toBeTruthy();
      expect(info.message).toBeTruthy();
    }
  });

  it("matches on substring — error code embedded in longer message", () => {
    const info = mapContractError(new Error("Contract call failed: Error(Contract, #6) at line 42"));
    expect(info.title).toBe("Invalid Outcome");
  });
});
