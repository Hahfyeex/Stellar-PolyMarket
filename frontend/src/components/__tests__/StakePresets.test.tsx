/**
 * Tests for StakePresets component and calcMaxBet utility.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import StakePresets from "../StakePresets";
import { calcMaxBet, BET_PRESETS, GAS_BUFFER_XLM } from "../../constants/betPresets";

// ---------------------------------------------------------------------------
// calcMaxBet unit tests
// ---------------------------------------------------------------------------
describe("calcMaxBet", () => {
  it("subtracts the gas buffer from the balance", () => {
    expect(calcMaxBet("100.50")).toBeCloseTo(100.5 - GAS_BUFFER_XLM);
  });

  it("returns 0 when balance equals the gas buffer", () => {
    expect(calcMaxBet(GAS_BUFFER_XLM)).toBe(0);
  });

  it("returns 0 when balance is less than the gas buffer", () => {
    expect(calcMaxBet(0.1)).toBe(0);
  });

  it("accepts a numeric argument", () => {
    expect(calcMaxBet(50)).toBeCloseTo(50 - GAS_BUFFER_XLM);
  });

  it("returns 0 for NaN input", () => {
    expect(calcMaxBet("not-a-number")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// StakePresets component tests
// ---------------------------------------------------------------------------
describe("StakePresets", () => {
  const onSelect = jest.fn();

  beforeEach(() => onSelect.mockClear());

  it("renders all configured preset buttons", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance={null} />);
    BET_PRESETS.forEach((p) => {
      expect(screen.getByTestId(`preset-${p}`)).toBeInTheDocument();
    });
  });

  it("does not render Max button when walletBalance is null", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance={null} />);
    expect(screen.queryByTestId("preset-max")).not.toBeInTheDocument();
  });

  it("renders Max button when walletBalance is provided", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance="200" />);
    expect(screen.getByTestId("preset-max")).toBeInTheDocument();
  });

  it("calls onSelect with the preset value as a string when clicked", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance={null} />);
    fireEvent.click(screen.getByTestId(`preset-${BET_PRESETS[0]}`));
    expect(onSelect).toHaveBeenCalledWith(String(BET_PRESETS[0]));
  });

  it("calls onSelect with max value (balance minus gas buffer) when Max is clicked", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance="100.50" />);
    fireEvent.click(screen.getByTestId("preset-max"));
    const expected = String(calcMaxBet("100.50"));
    expect(onSelect).toHaveBeenCalledWith(expected);
  });

  it("highlights the active preset that matches the current amount", () => {
    const preset = BET_PRESETS[1]; // e.g. 50
    render(<StakePresets amount={String(preset)} onSelect={onSelect} walletBalance={null} />);
    const btn = screen.getByTestId(`preset-${preset}`);
    expect(btn.className).toMatch(/bg-blue-600/);
  });

  it("does not highlight a preset when amount is a custom value", () => {
    render(<StakePresets amount="77" onSelect={onSelect} walletBalance={null} />);
    BET_PRESETS.forEach((p) => {
      expect(screen.getByTestId(`preset-${p}`).className).not.toMatch(/bg-blue-600/);
    });
  });

  it("highlights Max when amount matches the max value", () => {
    const balance = "100.50";
    const max = String(calcMaxBet(balance));
    render(<StakePresets amount={max} onSelect={onSelect} walletBalance={balance} />);
    expect(screen.getByTestId("preset-max").className).toMatch(/bg-blue-600/);
  });

  it("disables all buttons when disabled prop is true", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance="200" disabled={true} />);
    BET_PRESETS.forEach((p) => {
      expect(screen.getByTestId(`preset-${p}`)).toBeDisabled();
    });
    expect(screen.getByTestId("preset-max")).toBeDisabled();
  });

  it("disables Max button when balance is zero", () => {
    render(<StakePresets amount="" onSelect={onSelect} walletBalance="0" />);
    expect(screen.getByTestId("preset-max")).toBeDisabled();
  });
});
