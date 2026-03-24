/**
 * Tests for TradeDrawer component
 * Feature: mobile-navigation-shell
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";
import TradeDrawer from "../mobile/TradeDrawer";

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

describe("TradeDrawer", () => {
  it("renders nothing when closed", () => {
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={false} onClose={() => {}} walletAddress={null} />
    );
    expect(screen.queryByTestId("trade-drawer")).not.toBeInTheDocument();
  });

  it("renders the drawer when open", () => {
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={() => {}} walletAddress={null} />
    );
    expect(screen.getByTestId("trade-drawer")).toBeInTheDocument();
  });

  it("renders the drag handle", () => {
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={() => {}} walletAddress={null} />
    );
    expect(screen.getByTestId("trade-drawer-handle")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = jest.fn();
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={onClose} walletAddress={null} />
    );
    fireEvent.click(screen.getByTestId("trade-drawer-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies safe-area bottom padding style attribute to drawer", () => {
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={() => {}} walletAddress={null} />
    );
    const drawer = screen.getByTestId("trade-drawer");
    expect(drawer.getAttribute("data-safe-area")).toBe("bottom");
  });

  it("shows market question when open", () => {
    render(
      <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={() => {}} walletAddress={null} />
    );
    expect(screen.getByText("Will Bitcoin reach $100k?")).toBeInTheDocument();
  });
});

// --- Swipe gesture helpers ---

function simulateSwipe(handle: HTMLElement, deltaY: number) {
  fireEvent.touchStart(handle, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(handle, { touches: [{ clientY: deltaY }] });
  fireEvent.touchEnd(handle, { changedTouches: [{ clientY: deltaY }] });
}

// --- Property-based tests ---

describe("TradeDrawer — Property 4: Drawer close on sufficient drag", () => {
  /**
   * Feature: mobile-navigation-shell, Property 4: Drawer close on sufficient drag
   * Validates: Requirements 3.2
   *
   * For any drag distance > 30% of drawer height, releasing should call onClose.
   * We mock offsetHeight = 400, so threshold = 120px.
   */
  it("calls onClose for any drag distance above 30% of drawer height", () => {
    // Drawer offsetHeight defaults to 0 in jsdom, so we mock it
    const MOCK_HEIGHT = 400;
    const THRESHOLD = MOCK_HEIGHT * 0.3; // 120

    fc.assert(
      fc.property(
        fc.integer({ min: Math.ceil(THRESHOLD) + 1, max: MOCK_HEIGHT }),
        (dragDistance) => {
          const onClose = jest.fn();
          const { unmount } = render(
            <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={onClose} walletAddress={null} />
          );

          const drawer = screen.getByTestId("trade-drawer");
          // Mock offsetHeight
          Object.defineProperty(drawer, "offsetHeight", { value: MOCK_HEIGHT, configurable: true });

          const handle = screen.getByTestId("trade-drawer-handle");
          simulateSwipe(handle, dragDistance);

          expect(onClose).toHaveBeenCalled();
          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe("TradeDrawer — Property 5: Drawer snap-back on insufficient drag", () => {
  /**
   * Feature: mobile-navigation-shell, Property 5: Drawer snap-back on insufficient drag
   * Validates: Requirements 3.3
   *
   * For any drag distance < 30% of drawer height, releasing should NOT call onClose.
   */
  it("does not call onClose for drag distances below 30% of drawer height", () => {
    const MOCK_HEIGHT = 400;
    const THRESHOLD = MOCK_HEIGHT * 0.3; // 120

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Math.floor(THRESHOLD) - 1 }),
        (dragDistance) => {
          const onClose = jest.fn();
          const { unmount } = render(
            <TradeDrawer market={SAMPLE_MARKET} open={true} onClose={onClose} walletAddress={null} />
          );

          const drawer = screen.getByTestId("trade-drawer");
          Object.defineProperty(drawer, "offsetHeight", { value: MOCK_HEIGHT, configurable: true });

          const handle = screen.getByTestId("trade-drawer-handle");
          simulateSwipe(handle, dragDistance);

          expect(onClose).not.toHaveBeenCalled();
          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });
});
