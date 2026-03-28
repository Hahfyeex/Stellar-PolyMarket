/**
 * Tests for SlippageSettings component
 * Covers: preset buttons, custom input, localStorage persistence, restore on mount
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import SlippageSettings from "../SlippageSettings";

const STORAGE_KEY = "stella_slippage_pref";

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe("SlippageSettings — rendering", () => {
  it("renders the component", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    expect(screen.getByTestId("slippage-settings")).toBeInTheDocument();
  });

  it("renders all three preset buttons", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    expect(screen.getByTestId("slippage-preset-0.5")).toBeInTheDocument();
    expect(screen.getByTestId("slippage-preset-1")).toBeInTheDocument();
    expect(screen.getByTestId("slippage-preset-2")).toBeInTheDocument();
  });

  it("renders the Custom button", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    expect(screen.getByTestId("slippage-preset-custom")).toBeInTheDocument();
  });

  it("does not show custom input when a preset is active", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    expect(screen.queryByTestId("slippage-custom-input")).not.toBeInTheDocument();
  });
});

describe("SlippageSettings — preset selection", () => {
  it("calls onChange with 0.5 when 0.5% preset is clicked", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={1} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-0.5"));
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("calls onChange with 1 when 1% preset is clicked", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-1"));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("calls onChange with 2 when 2% preset is clicked", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-2"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("persists selected preset to localStorage", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("slippage-preset-1"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("active preset button has blue background class", () => {
    render(<SlippageSettings value={1} onChange={() => {}} />);
    const btn = screen.getByTestId("slippage-preset-1");
    expect(btn.className).toContain("bg-blue-600");
  });

  it("inactive preset buttons do not have blue background", () => {
    render(<SlippageSettings value={1} onChange={() => {}} />);
    const btn = screen.getByTestId("slippage-preset-0.5");
    expect(btn.className).not.toContain("bg-blue-600");
  });
});

describe("SlippageSettings — custom input", () => {
  it("shows custom input when Custom button is clicked", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    expect(screen.getByTestId("slippage-custom-input")).toBeInTheDocument();
  });

  it("calls onChange with parsed value from custom input", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    fireEvent.change(screen.getByTestId("slippage-custom-input"), {
      target: { value: "3.5" },
    });
    expect(onChange).toHaveBeenCalledWith(3.5);
  });

  it("persists custom value to localStorage", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    fireEvent.change(screen.getByTestId("slippage-custom-input"), {
      target: { value: "4" },
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("4");
  });

  it("does not call onChange for invalid custom input", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    onChange.mockClear();
    fireEvent.change(screen.getByTestId("slippage-custom-input"), {
      target: { value: "abc" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange for value > 50", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    onChange.mockClear();
    fireEvent.change(screen.getByTestId("slippage-custom-input"), {
      target: { value: "51" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("custom button has blue background when in custom mode", () => {
    render(<SlippageSettings value={0.5} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    expect(screen.getByTestId("slippage-preset-custom").className).toContain("bg-blue-600");
  });
});

describe("SlippageSettings — localStorage restore on mount", () => {
  it("restores a preset value from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "2");
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("restores a custom value from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "3.7");
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(3.7);
  });

  it("does not call onChange when localStorage is empty", () => {
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-number");
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores zero or negative localStorage values", () => {
    localStorage.setItem(STORAGE_KEY, "0");
    const onChange = jest.fn();
    render(<SlippageSettings value={0.5} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
