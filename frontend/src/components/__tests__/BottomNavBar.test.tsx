/**
 * Tests for BottomNavBar component
 * Feature: mobile-navigation-shell
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";
import BottomNavBar, { NavTab } from "../mobile/BottomNavBar";

const ALL_TABS: NavTab[] = ["home", "search", "portfolio", "profile"];

// --- Unit tests ---

describe("BottomNavBar", () => {
  it("renders all 4 tabs with correct labels", () => {
    render(<BottomNavBar activeTab="home" onTabChange={() => {}} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("applies aria-current=page only to the active tab", () => {
    render(<BottomNavBar activeTab="search" onTabChange={() => {}} />);
    expect(screen.getByTestId("nav-tab-search")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-tab-home")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("nav-tab-portfolio")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("nav-tab-profile")).not.toHaveAttribute("aria-current");
  });

  it("shows the active indicator only for the active tab", () => {
    render(<BottomNavBar activeTab="portfolio" onTabChange={() => {}} />);
    expect(screen.getByTestId("nav-tab-portfolio-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-tab-home-indicator")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-tab-search-indicator")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-tab-profile-indicator")).not.toBeInTheDocument();
  });

  it("calls onTabChange with the correct tab when clicked", () => {
    const handler = jest.fn();
    render(<BottomNavBar activeTab="home" onTabChange={handler} />);
    fireEvent.click(screen.getByTestId("nav-tab-portfolio"));
    expect(handler).toHaveBeenCalledWith("portfolio");
  });

  it("has fixed positioning and safe-area bottom padding style attribute", () => {
    render(<BottomNavBar activeTab="home" onTabChange={() => {}} />);
    const nav = screen.getByTestId("bottom-nav-bar");
    expect(nav).toHaveClass("fixed");
    expect(nav).toHaveClass("bottom-0");
    // Verify safe-area data attribute is present
    expect(nav.getAttribute("data-safe-area")).toBe("bottom");
  });
});

// --- Property-based tests ---

describe("BottomNavBar — Property 1: Active tab exclusivity", () => {
  /**
   * Feature: mobile-navigation-shell, Property 1: Active tab exclusivity
   * Validates: Requirements 1.2, 1.5
   *
   * For any NavTab value passed as activeTab, exactly one tab should have
   * the active indicator, and all other tabs should not.
   */
  it("exactly one tab has the active indicator for any activeTab value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_TABS), (tab) => {
        const { unmount } = render(<BottomNavBar activeTab={tab} onTabChange={() => {}} />);

        // The active tab has aria-current="page"
        const activeEl = screen.getByTestId(`nav-tab-${tab}`);
        expect(activeEl).toHaveAttribute("aria-current", "page");

        // All other tabs do NOT have aria-current
        const otherTabs = ALL_TABS.filter((t) => t !== tab);
        for (const other of otherTabs) {
          expect(screen.getByTestId(`nav-tab-${other}`)).not.toHaveAttribute("aria-current");
        }

        // Exactly one indicator element exists
        const indicators = ALL_TABS.filter(
          (t) => screen.queryByTestId(`nav-tab-${t}-indicator`) !== null
        );
        expect(indicators).toHaveLength(1);
        expect(indicators[0]).toBe(tab);

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
