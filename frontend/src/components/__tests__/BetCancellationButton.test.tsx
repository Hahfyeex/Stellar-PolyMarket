/**
 * BetCancellationButton.test.tsx
 *
 * Tests for cancellation button component:
 *   - Shows Cancel button when within grace period
 *   - Shows Locked when grace period expired
 *   - Countdown timer displays correctly
 *   - Click handler called
 *   - Loading state
 *   - Accessibility attributes
 */
import { render, screen, fireEvent } from "@testing-library/react";
import BetCancellationButton from "../BetCancellationButton";

// Mock useCountdownTimer
jest.mock("../../hooks/useCountdownTimer", () => ({
  useCountdownTimer: jest.fn(),
}));

import { useCountdownTimer } from "../../hooks/useCountdownTimer";

describe("BetCancellationButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows Locked when cancellableUntil is null", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "0s",
      isExpired: true,
    });

    render(<BetCancellationButton cancellableUntil={null} onCancelClick={jest.fn()} />);

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Locked when grace period expired", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "0s",
      isExpired: true,
    });

    render(
      <BetCancellationButton cancellableUntil="2024-01-01T00:00:00Z" onCancelClick={jest.fn()} />
    );

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Cancel button with countdown when within grace period", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "3m 42s",
      isExpired: false,
    });

    render(
      <BetCancellationButton cancellableUntil="2025-12-31T23:59:59Z" onCancelClick={jest.fn()} />
    );

    expect(screen.getByText("3m 42s")).toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("calls onCancelClick when button clicked", () => {
    const onCancelClick = jest.fn();
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "2m 30s",
      isExpired: false,
    });

    render(
      <BetCancellationButton
        cancellableUntil="2025-12-31T23:59:59Z"
        onCancelClick={onCancelClick}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onCancelClick).toHaveBeenCalledTimes(1);
  });

  it("disables button when isLoading is true", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "2m 30s",
      isExpired: false,
    });

    render(
      <BetCancellationButton
        cancellableUntil="2025-12-31T23:59:59Z"
        onCancelClick={jest.fn()}
        isLoading={true}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("shows loading spinner when isLoading is true", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "2m 30s",
      isExpired: false,
    });

    render(
      <BetCancellationButton
        cancellableUntil="2025-12-31T23:59:59Z"
        onCancelClick={jest.fn()}
        isLoading={true}
      />
    );

    // Check for spinner element (has animate-spin class)
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("has correct aria-label for accessibility", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "1m 15s",
      isExpired: false,
    });

    render(
      <BetCancellationButton cancellableUntil="2025-12-31T23:59:59Z" onCancelClick={jest.fn()} />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("1m 15s"));
  });

  it("does not call onCancelClick when disabled", () => {
    const onCancelClick = jest.fn();
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "2m 30s",
      isExpired: false,
    });

    render(
      <BetCancellationButton
        cancellableUntil="2025-12-31T23:59:59Z"
        onCancelClick={onCancelClick}
        isLoading={true}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onCancelClick).not.toHaveBeenCalled();
  });

  it("passes cancellableUntil to useCountdownTimer", () => {
    (useCountdownTimer as jest.Mock).mockReturnValue({
      formatted: "2m 30s",
      isExpired: false,
    });

    const testTime = "2025-12-31T23:59:59Z";
    render(<BetCancellationButton cancellableUntil={testTime} onCancelClick={jest.fn()} />);

    expect(useCountdownTimer).toHaveBeenCalledWith(testTime, expect.any(Function));
  });
});
