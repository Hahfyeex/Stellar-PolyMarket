/**
 * BetCancellationConfirmDialog.test.tsx
 *
 * Tests for confirmation dialog:
 *   - Dialog visibility based on isOpen prop
 *   - Displays bet details correctly
 *   - Shows refund amount
 *   - Confirm/Cancel button handlers
 *   - Loading state
 *   - Error message display
 *   - Accessibility (role, aria-labelledby, aria-describedby)
 */
import { render, screen, fireEvent } from "@testing-library/react";
import BetCancellationConfirmDialog from "../BetCancellationConfirmDialog";

describe("BetCancellationConfirmDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    isLoading: false,
    error: null,
    betId: 123,
    marketTitle: "Will Bitcoin reach $100k by end of 2024?",
    outcomeName: "Yes",
    refundAmount: 50.25,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(<BetCancellationConfirmDialog {...defaultProps} isOpen={false} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when isOpen is true", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("displays market title", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByText(defaultProps.marketTitle)).toBeInTheDocument();
  });

  it("displays outcome name", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByText(defaultProps.outcomeName)).toBeInTheDocument();
  });

  it("displays refund amount formatted correctly", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByText("50.25 XLM")).toBeInTheDocument();
  });

  it("displays bet ID for reference", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByText(`Bet ID: ${defaultProps.betId}`)).toBeInTheDocument();
  });

  it("calls onConfirm when Cancel Bet button clicked", () => {
    const onConfirm = jest.fn();
    render(<BetCancellationConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    const confirmButton = screen.getByText("Cancel Bet");
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Keep Bet button clicked", () => {
    const onClose = jest.fn();
    render(<BetCancellationConfirmDialog {...defaultProps} onClose={onClose} />);

    const cancelButton = screen.getByText("Keep Bet");
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button (✕) clicked", () => {
    const onClose = jest.fn();
    render(<BetCancellationConfirmDialog {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByLabelText("Close dialog");
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = jest.fn();
    const { container } = render(
      <BetCancellationConfirmDialog {...defaultProps} onClose={onClose} />
    );

    const backdrop = container.querySelector(".bg-black\\/85");
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it("disables buttons when isLoading is true", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} isLoading={true} />);

    const confirmButton = screen.getByText("Cancelling...");
    const cancelButton = screen.getByText("Keep Bet");

    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it("shows loading spinner when isLoading is true", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} isLoading={true} />);

    expect(screen.getByText("Cancelling...")).toBeInTheDocument();
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("displays error message when error prop is provided", () => {
    const errorMsg = "Failed to cancel bet. Please try again.";
    render(<BetCancellationConfirmDialog {...defaultProps} error={errorMsg} />);

    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it("does not display error message when error is null", () => {
    const { container } = render(<BetCancellationConfirmDialog {...defaultProps} error={null} />);

    const errorBox = container.querySelector(".bg-red-900\\/20");
    expect(errorBox).not.toBeInTheDocument();
  });

  it("has correct accessibility attributes", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "cancel-dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "cancel-dialog-description");
  });

  it("has correct title id", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    const title = screen.getByText("Cancel Bet?");
    expect(title).toHaveAttribute("id", "cancel-dialog-title");
  });

  it("does not call onConfirm when disabled", () => {
    const onConfirm = jest.fn();
    render(
      <BetCancellationConfirmDialog {...defaultProps} onConfirm={onConfirm} isLoading={true} />
    );

    const confirmButton = screen.getByText("Cancelling...");
    fireEvent.click(confirmButton);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("displays warning message about grace period", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} />);

    expect(screen.getByText(/You will receive a full refund/)).toBeInTheDocument();
  });

  it("handles large refund amounts correctly", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} refundAmount={9999.99} />);

    expect(screen.getByText("9999.99 XLM")).toBeInTheDocument();
  });

  it("handles small refund amounts correctly", () => {
    render(<BetCancellationConfirmDialog {...defaultProps} refundAmount={0.01} />);

    expect(screen.getByText("0.01 XLM")).toBeInTheDocument();
  });

  it("stops propagation when dialog content clicked", () => {
    const { container } = render(<BetCancellationConfirmDialog {...defaultProps} />);

    const dialog = container.querySelector('[role="alertdialog"]');
    const event = new MouseEvent("click", { bubbles: true });
    const stopPropagationSpy = jest.spyOn(event, "stopPropagation");

    if (dialog) {
      dialog.dispatchEvent(event);
      expect(stopPropagationSpy).toHaveBeenCalled();
    }
  });
});
