import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BetSlipSummary from "../BetSlipSummary";

const baseProps = {
  marketQuestion: "Will BTC exceed $100k by end of 2025?",
  outcomeLabel: "Yes",
  stakeStroops: 10_000_000n, // 1 XLM
  feeRateBps: 200, // 2%
  estimatedPayoutStroops: 19_000_000n, // 1.9 XLM
  entryOddsBps: 5000,
  currentOddsBps: 5000,
  onConfirm: jest.fn(),
  onBack: jest.fn(),
};

describe("BetSlipSummary (#591)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders market question and outcome", () => {
    render(<BetSlipSummary {...baseProps} />);
    expect(screen.getByText(baseProps.marketQuestion)).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  test("displays stake in XLM from stroops", () => {
    render(<BetSlipSummary {...baseProps} />);
    expect(screen.getByText("1.0000000 XLM")).toBeInTheDocument();
  });

  test("calculates fee correctly from stroops", () => {
    render(<BetSlipSummary {...baseProps} />);
    // 1 XLM * 2% = 0.02 XLM = 200_000 stroops
    expect(screen.getByText("0.0200000 XLM")).toBeInTheDocument();
  });

  test("calculates net payout after fee", () => {
    render(<BetSlipSummary {...baseProps} />);
    // 1.9 XLM - 0.02 XLM = 1.88 XLM = 18_800_000 stroops
    expect(screen.getByText("1.8800000 XLM")).toBeInTheDocument();
  });

  test("no slippage warning when odds unchanged", () => {
    render(<BetSlipSummary {...baseProps} />);
    expect(screen.queryByTestId("slippage-warning")).not.toBeInTheDocument();
  });

  test("shows slippage warning when odds drift > 50 bps", () => {
    render(<BetSlipSummary {...baseProps} currentOddsBps={5100} />);
    expect(screen.getByTestId("slippage-warning")).toBeInTheDocument();
  });

  test("no slippage warning when drift is exactly 50 bps (boundary)", () => {
    render(<BetSlipSummary {...baseProps} currentOddsBps={5050} />);
    expect(screen.queryByTestId("slippage-warning")).not.toBeInTheDocument();
  });

  test("Confirm button calls onConfirm", () => {
    render(<BetSlipSummary {...baseProps} />);
    fireEvent.click(screen.getByTestId("bet-slip-confirm"));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  test("Back button calls onBack without submitting", () => {
    render(<BetSlipSummary {...baseProps} />);
    fireEvent.click(screen.getByTestId("bet-slip-back"));
    expect(baseProps.onBack).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });

  test("all amounts use stroop integers — no floating point in display", () => {
    // 7 decimal places = stroop precision
    render(<BetSlipSummary {...baseProps} />);
    const xlmValues = screen.getAllByText(/\d+\.\d{7} XLM/);
    expect(xlmValues.length).toBeGreaterThanOrEqual(3);
  });
});
