/**
 * BetCancellationCell.test.tsx
 *
 * Integration tests for the full bet cancellation flow:
 *   - Button click opens confirmation dialog
 *   - Confirmation triggers API call
 *   - Success toast shown with refund amount
 *   - Error handling
 *   - Callback on success
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BetCancellationCell from "../BetCancellationCell";
import { ToastProvider } from "../ToastProvider";

// Mock the hooks
jest.mock("../../hooks/useCancelBet");
jest.mock("../../hooks/useCountdownTimer", () => ({
  useCountdownTimer: jest.fn(() => ({
    formatted: "2m 30s",
    isExpired: false,
  })),
}));

import { useCancelBet } from "../../hooks/useCancelBet";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
};

describe("BetCancellationCell — Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders cancel button when within grace period", () => {
    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByRole("button", { name: /2m 30s/ });
    expect(button).toBeInTheDocument();
  });

  it("opens confirmation dialog when cancel button clicked", async () => {
    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  it("calls mutate when confirmation confirmed", async () => {
    const mockMutate = jest.fn();
    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    // Open dialog
    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    // Confirm cancellation
    await waitFor(() => {
      const confirmButton = screen.getByText("Cancel Bet");
      fireEvent.click(confirmButton);
    });

    expect(mockMutate).toHaveBeenCalledWith(123, expect.any(Object));
  });

  it("shows success toast on successful cancellation", async () => {
    const mockMutate = jest.fn((betId, callbacks) => {
      callbacks.onSuccess({ refunded_amount: "50.25" });
    });

    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    // Open dialog and confirm
    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    await waitFor(() => {
      const confirmButton = screen.getByText("Cancel Bet");
      fireEvent.click(confirmButton);
    });

    // Check for success toast
    await waitFor(() => {
      expect(screen.getByText(/Bet cancelled/)).toBeInTheDocument();
      expect(screen.getByText(/50.25 XLM/)).toBeInTheDocument();
    });
  });

  it("calls onCancellationSuccess callback", async () => {
    const onSuccess = jest.fn();
    const mockMutate = jest.fn((betId, callbacks) => {
      callbacks.onSuccess({ refunded_amount: "50.25" });
    });

    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
        onCancellationSuccess={onSuccess}
      />,
      { wrapper: createWrapper() }
    );

    // Open dialog and confirm
    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    await waitFor(() => {
      const confirmButton = screen.getByText("Cancel Bet");
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("closes dialog after successful cancellation", async () => {
    const mockMutate = jest.fn((betId, callbacks) => {
      callbacks.onSuccess({ refunded_amount: "50.25" });
    });

    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    // Open dialog
    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    // Confirm
    const confirmButton = screen.getByText("Cancel Bet");
    fireEvent.click(confirmButton);

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("shows error message on cancellation failure", async () => {
    const mockMutate = jest.fn((betId, callbacks) => {
      callbacks.onError(new Error("Grace period expired"));
    });

    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    // Open dialog and confirm
    const button = screen.getByRole("button", { name: /2m 30s/ });
    fireEvent.click(button);

    await waitFor(() => {
      const confirmButton = screen.getByText("Cancel Bet");
      fireEvent.click(confirmButton);
    });

    // Check for error toast
    await waitFor(() => {
      expect(screen.getByText(/Grace period expired/)).toBeInTheDocument();
    });
  });

  it("disables button during loading", async () => {
    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: true,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress="GABC123"
      />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("handles null walletAddress gracefully", () => {
    (useCancelBet as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });

    render(
      <BetCancellationCell
        betId={123}
        cancellableUntil="2025-12-31T23:59:59Z"
        marketTitle="Will Bitcoin reach $100k?"
        outcomeName="Yes"
        refundAmount={50.25}
        walletAddress={null}
      />,
      { wrapper: createWrapper() }
    );

    expect(useCancelBet).toHaveBeenCalledWith(null);
  });
});
