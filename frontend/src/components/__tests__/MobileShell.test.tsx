/**
 * Tests for MobileShell component
 * Feature: mobile-shell-layout
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MobileShell from "../mobile/MobileShell";
import type { Market } from "../../types/market";

// Mock child components
jest.mock("../mobile/BottomNavBar", () => {
  return function MockBottomNavBar() {
    return <div data-testid="bottom-nav-bar">Bottom Nav</div>;
  };
});

jest.mock("../mobile/FloatingBetButton", () => {
  return function MockFloatingBetButton() {
    return <div data-testid="floating-bet-button">FAB</div>;
  };
});

jest.mock("../mobile/TradeDrawer", () => {
  return function MockTradeDrawer() {
    return <div data-testid="trade-drawer">Drawer</div>;
  };
});

// Mock hooks
jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

jest.mock("../../hooks/useScrollRestoration", () => ({
  useScrollRestoration: jest.fn(),
}));

jest.mock("../../hooks/useMetaThemeColor", () => ({
  useMetaThemeColor: jest.fn(),
}));

describe("MobileShell", () => {
  const mockMarket: Market = {
    id: 1,
    question: "Test Market",
    outcomes: ["Yes", "No"],
    end_date: new Date(Date.now() + 86400000).toISOString(),
    resolved: false,
    winning_outcome: null,
    total_pool: "100",
    status: "ACTIVE",
    contract_address: "test-address",
  } as Market;

  it("renders mobile shell container", () => {
    render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
  });

  it("renders all child components", () => {
    render(
      <MobileShell
        activeMarket={mockMarket}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    expect(screen.getByTestId("bottom-nav-bar")).toBeInTheDocument();
    expect(screen.getByTestId("floating-bet-button")).toBeInTheDocument();
    expect(screen.getByTestId("trade-drawer")).toBeInTheDocument();
  });

  it("renders children content", () => {
    render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div data-testid="page-content">Test Content</div>}
      />
    );
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("applies safe area insets via style", () => {
    const { container } = render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    const shell = container.querySelector("[data-testid='mobile-shell']");
    expect(shell).toHaveStyle({
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
      overscrollBehavior: "contain",
    });
  });

  it("adds bottom padding to content wrapper", () => {
    const { container } = render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    const contentWrapper = container.querySelector(".pb-20");
    expect(contentWrapper).toBeInTheDocument();
  });

  it("calls useMetaThemeColor hook", () => {
    const { useMetaThemeColor } = require("../../hooks/useMetaThemeColor");
    render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    expect(useMetaThemeColor).toHaveBeenCalled();
  });

  it("calls useScrollRestoration hook", () => {
    const { useScrollRestoration } = require("../../hooks/useScrollRestoration");
    render(
      <MobileShell
        activeMarket={null}
        walletAddress="GTEST"
        children={<div>Content</div>}
      />
    );
    expect(useScrollRestoration).toHaveBeenCalled();
  });
});
