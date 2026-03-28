import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketTabs from "../MarketTabs";
import type { TabKey } from "../../hooks/useMarketTabs";

const defaultProps = {
  activeTab: "active" as TabKey,
  activeBadge: 5,
  resolvedBadge: 3,
  onChange: jest.fn(),
};

describe("MarketTabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders both tabs", () => {
    render(<MarketTabs {...defaultProps} />);
    expect(screen.getByRole("tab", { name: /active markets/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /resolved markets/i })).toBeInTheDocument();
  });

  it("marks the active tab as selected", () => {
    render(<MarketTabs {...defaultProps} activeTab="active" />);
    expect(screen.getByRole("tab", { name: /active markets/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /resolved markets/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("marks the resolved tab as selected when activeTab is resolved", () => {
    render(<MarketTabs {...defaultProps} activeTab="resolved" />);
    expect(screen.getByRole("tab", { name: /resolved markets/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /active markets/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("displays correct badge count for active tab", () => {
    render(<MarketTabs {...defaultProps} activeBadge={7} />);
    const activeTab = screen.getByRole("tab", { name: /active markets/i });
    expect(activeTab).toHaveTextContent("7");
  });

  it("displays correct badge count for resolved tab", () => {
    render(<MarketTabs {...defaultProps} resolvedBadge={12} />);
    const resolvedTab = screen.getByRole("tab", { name: /resolved markets/i });
    expect(resolvedTab).toHaveTextContent("12");
  });

  it("calls onChange with 'resolved' when resolved tab is clicked", () => {
    const onChange = jest.fn();
    render(<MarketTabs {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /resolved markets/i }));
    expect(onChange).toHaveBeenCalledWith("resolved");
  });

  it("calls onChange with 'active' when active tab is clicked", () => {
    const onChange = jest.fn();
    render(<MarketTabs {...defaultProps} activeTab="resolved" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /active markets/i }));
    expect(onChange).toHaveBeenCalledWith("active");
  });

  it("renders tablist with accessible label", () => {
    render(<MarketTabs {...defaultProps} />);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Market status tabs");
  });

  it("active tab has blue styling class", () => {
    render(<MarketTabs {...defaultProps} activeTab="active" />);
    const activeBtn = screen.getByRole("tab", { name: /active markets/i });
    expect(activeBtn.className).toContain("border-blue-500");
  });

  it("inactive tab does not have blue border styling", () => {
    render(<MarketTabs {...defaultProps} activeTab="active" />);
    const resolvedBtn = screen.getByRole("tab", { name: /resolved markets/i });
    expect(resolvedBtn.className).not.toContain("border-blue-500");
  });

  it("updates badge display when props change", () => {
    const { rerender } = render(<MarketTabs {...defaultProps} activeBadge={5} />);
    expect(screen.getByRole("tab", { name: /active markets/i })).toHaveTextContent("5");

    rerender(<MarketTabs {...defaultProps} activeBadge={8} />);
    expect(screen.getByRole("tab", { name: /active markets/i })).toHaveTextContent("8");
  });
});
