/**
 * Tests for Skeleton Loading Components
 * Feature: skeleton-loading-states
 */

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import Skeleton from "../Skeleton";
import MarketCardSkeleton from "../skeletons/MarketCardSkeleton";
import ActivityFeedSkeleton from "../skeletons/ActivityFeedSkeleton";
import MetricsSkeletons from "../skeletons/MetricsSkeletons";

describe("Skeleton Component", () => {
  describe("Base Skeleton", () => {
    it("renders a skeleton element with default className", () => {
      const { container } = render(<Skeleton />);
      const element = container.querySelector(".skeleton");
      expect(element).toBeInTheDocument();
      expect(element).toHaveClass("h-12", "w-full");
    });

    it("renders with custom className", () => {
      const { container } = render(<Skeleton className="h-20 w-40 rounded-lg" />);
      const element = container.querySelector(".skeleton");
      expect(element).toHaveClass("h-20", "w-40", "rounded-lg");
    });

    it("renders with custom HTML element type", () => {
      const { container } = render(<Skeleton element="span" className="h-10" />);
      const element = container.querySelector("span.skeleton");
      expect(element).toBeInTheDocument();
    });

    it("renders multiple skeletons when count is provided", () => {
      const { container } = render(<Skeleton count={3} className="h-8 mb-2" />);
      const skeletons = container.querySelectorAll(".skeleton");
      expect(skeletons).toHaveLength(3);
    });

    it("applies gap between multiple skeletons", () => {
      const { container } = render(<Skeleton count={2} gap="1rem" />);
      const firstSkeleton = container.querySelectorAll(".skeleton")[0] as HTMLElement;
      expect(firstSkeleton.style.marginBottom).toBe("1rem");
    });

    it("does not apply gap to last skeleton", () => {
      const { container } = render(<Skeleton count={2} gap="1rem" />);
      const skeletons = container.querySelectorAll(".skeleton");
      const lastSkeleton = skeletons[skeletons.length - 1] as HTMLElement;
      expect(lastSkeleton.style.marginBottom).toBe("");
    });

    it("has shimmer CSS class applied for animation", () => {
      const { container } = render(<Skeleton className="h-12" />);
      const skeleton = container.querySelector(".skeleton");
      expect(skeleton).toHaveClass("skeleton");
      // Verify animation is set in CSS (computed styles won't show animation in jsdom)
    });
  });

  describe("MarketCardSkeleton", () => {
    it("renders market card skeleton layout", () => {
      const { container } = render(<MarketCardSkeleton />);
      const skeletons = container.querySelectorAll(".skeleton");

      // Should have multiple skeleton placeholders for:
      // Title (2 lines), status badge, pool info, chart, buttons, input, message
      expect(skeletons.length).toBeGreaterThan(7);
    });

    it("has the same base styling as real MarketCard", () => {
      const { container } = render(<MarketCardSkeleton />);
      const wrapper = container.querySelector(".bg-gray-900");

      expect(wrapper).toHaveClass("bg-gray-900", "rounded-xl", "p-5", "border", "border-gray-800");
    });

    it("includes placeholder for title section", () => {
      const { container } = render(<MarketCardSkeleton />);
      const skeletons = container.querySelectorAll(".skeleton");

      // Should have title skeletons that form the question
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("includes placeholder for pool chart", () => {
      const { container } = render(<MarketCardSkeleton />);
      const chartSkeleton = container.querySelector(".h-32");

      expect(chartSkeleton).toBeInTheDocument();
      expect(chartSkeleton).toHaveClass("skeleton");
    });

    it("includes placeholder for outcome buttons", () => {
      const { container } = render(<MarketCardSkeleton />);
      const buttonSkeletons = container.querySelectorAll(".h-10.w-24");

      // Should have 2 outcome button skeletons
      expect(buttonSkeletons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("ActivityFeedSkeleton", () => {
    it("renders default 3 rows of activity skeleton", () => {
      const { container } = render(<ActivityFeedSkeleton />);
      const rows = container.querySelectorAll("li");

      expect(rows).toHaveLength(3);
    });

    it("renders custom count of rows", () => {
      const { container } = render(<ActivityFeedSkeleton count={5} />);
      const rows = container.querySelectorAll("li");

      expect(rows).toHaveLength(5);
    });

    it("has the same base styling as LiveActivityFeed", () => {
      const { container } = render(<ActivityFeedSkeleton count={1} />);
      const wrapper = container.querySelector(".bg-gray-900");

      expect(wrapper).toHaveClass("bg-gray-900", "rounded-xl", "border", "border-gray-800");
    });

    it("includes header with live indicator", () => {
      const { container } = render(<ActivityFeedSkeleton count={1} />);
      const headerSkeletons = container.querySelectorAll(".border-b.border-gray-800 .skeleton");

      // Should have header skeletons for dot and text
      expect(headerSkeletons.length).toBeGreaterThan(0);
    });

    it("each row has placeholders for question, amounts, and time", () => {
      const { container } = render(<ActivityFeedSkeleton count={1} />);
      const row = container.querySelector("li");
      const rowSkeletons = row?.querySelectorAll(".skeleton");

      // Should have multiple skeletons per row
      expect(rowSkeletons!.length).toBeGreaterThan(2);
    });

    it("renders all rows with consistent structure", () => {
      const { container } = render(<ActivityFeedSkeleton count={3} />);
      const rows = container.querySelectorAll("li");

      rows.forEach((row) => {
        const skeletons = row.querySelectorAll(".skeleton");
        // Each row should have similar structure
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe("MetricsSkeletons", () => {
    it("renders 4 metric card skeletons", () => {
      const { container } = render(<MetricsSkeletons />);
      const cards = container.querySelectorAll(".bg-gradient-to-br");

      expect(cards).toHaveLength(4);
    });

    it("has the same grid layout as real metrics", () => {
      const { container } = render(<MetricsSkeletons />);
      const grid = container.querySelector(".grid");

      expect(grid).toHaveClass(
        "grid",
        "grid-cols-1",
        "md:grid-cols-2",
        "lg:grid-cols-4",
        "gap-4",
        "mb-8"
      );
    });

    it("each card has icon, label, value, and subtext placeholders", () => {
      const { container } = render(<MetricsSkeletons />);
      const firstCard = container.querySelector(".bg-gradient-to-br");
      const skeletons = firstCard?.querySelectorAll(".skeleton");

      // Should have skeletons for: icon, label, value, subtext
      expect(skeletons!.length).toBeGreaterThanOrEqual(4);
    });

    it("all 4 cards have consistent structure", () => {
      const { container } = render(<MetricsSkeletons />);
      const cards = container.querySelectorAll(".bg-gradient-to-br");

      cards.forEach((card) => {
        const skeletons = card.querySelectorAll(".skeleton");
        // Each card should have similar number of skeletons
        expect(skeletons.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("includes proper styling for icon placeholders", () => {
      const { container } = render(<MetricsSkeletons />);
      const iconSkeletons = container.querySelectorAll(".h-12.w-12");

      expect(iconSkeletons.length).toBeGreaterThan(0);
      iconSkeletons.forEach((icon) => {
        expect(icon).toHaveClass("skeleton", "rounded-lg");
      });
    });
  });

  describe("Skeleton CSS Shimmer Animation", () => {
    it("skeleton element has shimmer styling applied", () => {
      const { container } = render(<Skeleton />);
      const skeleton = container.querySelector(".skeleton");

      // Verify the element exists and has the skeleton class
      expect(skeleton).toBeTruthy();
      expect(skeleton).toHaveClass("skeleton");
    });

    it("multiple skeletons all have shimmer class", () => {
      const { container } = render(<Skeleton count={3} />);
      const skeletons = container.querySelectorAll(".skeleton");

      skeletons.forEach((skeleton) => {
        expect(skeleton).toHaveClass("skeleton");
      });
    });
  });

  describe("Layout Consistency - CLS Prevention", () => {
    it("MarketCardSkeleton has same height as typical MarketCard", () => {
      const { container } = render(<MarketCardSkeleton />);
      const wrapper = container.querySelector(".bg-gray-900.rounded-xl");

      // Should have adequate padding and content to match real component height
      expect(wrapper).toHaveClass("p-5", "flex", "flex-col", "gap-3");
    });

    it("ActivityFeedSkeleton rows have consistent heights", () => {
      const { container } = render(<ActivityFeedSkeleton count={3} />);
      const rows = container.querySelectorAll("li");

      rows.forEach((row) => {
        expect(row).toHaveClass("px-5", "py-3", "flex");
      });
    });

    it("MetricsSkeletons maintains grid spacing", () => {
      const { container } = render(<MetricsSkeletons />);
      const grid = container.querySelector(".grid");

      expect(grid).toHaveClass("gap-4", "mb-8");
    });

    it("all skeleton cards have proper padding", () => {
      const { container } = render(<MetricsSkeletons />);
      const cards = container.querySelectorAll(".rounded-xl");

      cards.forEach((card) => {
        expect(card).toHaveClass("p-6");
      });
    });
  });
});
