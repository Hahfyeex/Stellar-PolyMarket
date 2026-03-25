/**
 * Tests for WhatIfSimulator component
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import WhatIfSimulator from "../WhatIfSimulator";

// Mock recharts to avoid SVG rendering issues in jsdom
jest.mock("recharts", () => {
  const React = require("react");
  return {
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div />,
    Cell: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    Tooltip: () => <div />,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

const DEFAULT_PROPS = {
  poolForOutcome: 400,
  totalPool: 1000,
};

describe("WhatIfSimulator", () => {
  it("renders the simulator container", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("whatif-simulator")).toBeInTheDocument();
  });

  it("renders the toggle button", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("simulator-toggle")).toBeInTheDocument();
  });

  it("is collapsed by default (body hidden)", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    const body = screen.getByTestId("simulator-body");
    expect(body).toHaveClass("max-h-0");
  });

  it("expands when toggle is clicked", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    const body = screen.getByTestId("simulator-body");
    expect(body).toHaveClass("max-h-[500px]");
  });

  it("collapses again on second toggle click", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    const btn = screen.getByTestId("simulator-toggle");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId("simulator-body")).toHaveClass("max-h-0");
  });

  it("toggle button has correct aria-expanded attribute", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    const btn = screen.getByTestId("simulator-toggle");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("renders slider and number input when open", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    expect(screen.getByTestId("stake-slider")).toBeInTheDocument();
    expect(screen.getByTestId("stake-input")).toBeInTheDocument();
  });

  it("renders the bar chart when open", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("displays implied probability", async () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    // poolForOutcome=400, totalPool=1000 → 40.0%
    await waitFor(() => {
      expect(screen.getByTestId("implied-prob")).toHaveTextContent("40.0%");
    });
  });

  it("displays projected payout", async () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("projected-payout")).toBeInTheDocument();
    });
  });

  it("displays projected profit/loss", async () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("projected-profit")).toBeInTheDocument();
    });
  });

  it("slider and number input stay in sync", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    const slider = screen.getByTestId("stake-slider") as HTMLInputElement;
    const input = screen.getByTestId("stake-input") as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "200" } });
    expect(slider.value).toBe("200");

    fireEvent.change(input, { target: { value: "300" } });
    expect(input.value).toBe("300");
  });

  it("updates payout after debounce when stake changes", async () => {
    jest.useFakeTimers();
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));

    fireEvent.change(screen.getByTestId("stake-slider"), { target: { value: "500" } });

    act(() => { jest.advanceTimersByTime(250); });

    await waitFor(() => {
      const payout = screen.getByTestId("projected-payout").textContent ?? "";
      // stake=500, pool=400, total=1000 → share=500/900≈0.556; payout≈539.4
      expect(parseFloat(payout)).toBeGreaterThan(0);
    });

    jest.useRealTimers();
  });

  it("clamps number input to minimum of 1", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    const input = screen.getByTestId("stake-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-50" } });
    expect(Number(input.value)).toBeGreaterThanOrEqual(1);
  });

  it("uses custom maxStake for slider max", () => {
    render(<WhatIfSimulator {...DEFAULT_PROPS} maxStake={500} />);
    fireEvent.click(screen.getByTestId("simulator-toggle"));
    const slider = screen.getByTestId("stake-slider") as HTMLInputElement;
    expect(slider.max).toBe("500");
  });
});
