/**
 * Tests for SlippageWarningModal component
 * Covers: rendering, drift calculation display, proceed/cancel callbacks
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SlippageWarningModal from "../SlippageWarningModal";

const DEFAULT_PROPS = {
  expectedPayout: 100,
  currentPayout: 98,
  tolerancePct: 0.5,
  onProceed: jest.fn(),
  onCancel: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe("SlippageWarningModal — rendering", () => {
  it("renders the modal", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("slippage-warning-modal")).toBeInTheDocument();
  });

  it("has role=dialog and aria-modal=true", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    const modal = screen.getByTestId("slippage-warning-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  it("shows the expected payout", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("expected-payout")).toHaveTextContent("100.0000000 XLM");
  });

  it("shows the current payout", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("current-payout")).toHaveTextContent("98.0000000 XLM");
  });

  it("shows the payout difference", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("payout-diff")).toHaveTextContent("-2.0000000 XLM");
  });

  it("shows the drift percentage in the description", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    // 2% drift on 100 expected
    expect(screen.getByText(/2\.00%/)).toBeInTheDocument();
  });

  it("shows the tolerance in the description", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByText(/0\.5%/)).toBeInTheDocument();
  });

  it("renders Proceed and Cancel buttons", () => {
    render(<SlippageWarningModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("slippage-proceed")).toBeInTheDocument();
    expect(screen.getByTestId("slippage-cancel")).toBeInTheDocument();
  });
});

describe("SlippageWarningModal — interactions", () => {
  it("calls onProceed when Proceed button is clicked", () => {
    const onProceed = jest.fn();
    render(<SlippageWarningModal {...DEFAULT_PROPS} onProceed={onProceed} />);
    fireEvent.click(screen.getByTestId("slippage-proceed"));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = jest.fn();
    render(<SlippageWarningModal {...DEFAULT_PROPS} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("slippage-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onProceed when Cancel is clicked", () => {
    const onProceed = jest.fn();
    render(<SlippageWarningModal {...DEFAULT_PROPS} onProceed={onProceed} />);
    fireEvent.click(screen.getByTestId("slippage-cancel"));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("does not call onCancel when Proceed is clicked", () => {
    const onCancel = jest.fn();
    render(<SlippageWarningModal {...DEFAULT_PROPS} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("slippage-proceed"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("SlippageWarningModal — drift calculation", () => {
  it("shows 0.00% drift when payouts are equal", () => {
    render(
      <SlippageWarningModal
        {...DEFAULT_PROPS}
        expectedPayout={100}
        currentPayout={100}
      />
    );
    expect(screen.getByText(/0\.00%/)).toBeInTheDocument();
  });

  it("shows correct drift for 1% drop", () => {
    render(
      <SlippageWarningModal
        {...DEFAULT_PROPS}
        expectedPayout={100}
        currentPayout={99}
      />
    );
    expect(screen.getByText(/1\.00%/)).toBeInTheDocument();
  });

  it("shows 0.00% drift when expected is zero (guard)", () => {
    render(
      <SlippageWarningModal
        {...DEFAULT_PROPS}
        expectedPayout={0}
        currentPayout={0}
      />
    );
    expect(screen.getByText(/0\.00%/)).toBeInTheDocument();
  });
});
