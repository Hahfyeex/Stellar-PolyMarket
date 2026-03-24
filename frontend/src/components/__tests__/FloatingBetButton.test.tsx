/**
 * Tests for FloatingBetButton component
 * Feature: mobile-navigation-shell
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";
import FloatingBetButton from "../mobile/FloatingBetButton";

const SAMPLE_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k?",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
};

// --- Unit tests ---

describe("FloatingBetButton", () => {
  it("renders the button", () => {
    render(<FloatingBetButton activeMarket={SAMPLE_MARKET} drawerOpen={false} onPress={() => {}} />);
    expect(screen.getByTestId("floating-bet-button")).toBeInTheDocument();
  });

  it("calls onPress when clicked with an active market", () => {
    const handler = jest.fn();
    render(<FloatingBetButton activeMarket={SAMPLE_MARKET} drawerOpen={false} onPress={handler} />);
    fireEvent.click(screen.getByTestId("floating-bet-button"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("is disabled when activeMarket is null", () => {
    render(<FloatingBetButton activeMarket={null} drawerOpen={false} onPress={() => {}} />);
    expect(screen.getByTestId("floating-bet-button")).toBeDisabled();
  });

  it("has opacity-0 class when drawerOpen is true", () => {
    render(<FloatingBetButton activeMarket={SAMPLE_MARKET} drawerOpen={true} onPress={() => {}} />);
    const btn = screen.getByTestId("floating-bet-button");
    expect(btn.className).toContain("opacity-0");
  });
});

// --- Property-based tests ---

describe("FloatingBetButton — Property 2: FAB disabled when no active market", () => {
  /**
   * Feature: mobile-navigation-shell, Property 2: FAB disabled when no active market
   * Validates: Requirements 2.3
   *
   * For any render where activeMarket is null, the button must be disabled.
   */
  it("is always disabled when activeMarket is null regardless of drawerOpen", () => {
    fc.assert(
      fc.property(fc.boolean(), (drawerOpen) => {
        const { unmount } = render(
          <FloatingBetButton activeMarket={null} drawerOpen={drawerOpen} onPress={() => {}} />
        );
        expect(screen.getByTestId("floating-bet-button")).toBeDisabled();
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

describe("FloatingBetButton — Property 3: FAB hidden when drawer is open", () => {
  /**
   * Feature: mobile-navigation-shell, Property 3: FAB hidden when drawer is open
   * Validates: Requirements 2.5
   *
   * For any render where drawerOpen is true, the button must have opacity-0 styling.
   */
  it("always has opacity-0 when drawerOpen is true, regardless of activeMarket", () => {
    const marketArb = fc.option(fc.constant(SAMPLE_MARKET), { nil: null });
    fc.assert(
      fc.property(marketArb, (market) => {
        const { unmount } = render(
          <FloatingBetButton activeMarket={market} drawerOpen={true} onPress={() => {}} />
        );
        const btn = screen.getByTestId("floating-bet-button");
        expect(btn.className).toContain("opacity-0");
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
