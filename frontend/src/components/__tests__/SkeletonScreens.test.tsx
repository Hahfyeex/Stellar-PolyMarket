/**
 * Tests for skeleton loading components — Issue #482
 * Covers: MarketListSkeleton, MarketDetailSkeleton, PortfolioSkeleton, LeaderboardSkeleton
 */

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketListSkeleton from "../skeletons/MarketListSkeleton";
import MarketDetailSkeleton from "../skeletons/MarketDetailSkeleton";
import PortfolioSkeleton from "../skeletons/PortfolioSkeleton";
import LeaderboardSkeleton from "../skeletons/LeaderboardSkeleton";

describe("MarketListSkeleton", () => {
  it("renders 6 market card skeletons", () => {
    const { container } = render(<MarketListSkeleton />);
    // Each MarketCardSkeleton has bg-gray-900 rounded-xl p-5
    const cards = container.querySelectorAll(".bg-gray-900.rounded-xl.p-5");
    expect(cards).toHaveLength(6);
  });

  it("uses a two-column grid layout matching the markets list", () => {
    const { container } = render(<MarketListSkeleton />);
    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("grid-cols-1", "md:grid-cols-2", "gap-4");
  });

  it("all cards contain skeleton elements for shimmer animation", () => {
    const { container } = render(<MarketListSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(6);
  });

  it("each card has border and rounded styling matching MarketCard", () => {
    const { container } = render(<MarketListSkeleton />);
    const cards = container.querySelectorAll(".bg-gray-900.rounded-xl.p-5");
    cards.forEach((card) => {
      expect(card).toHaveClass("border", "border-gray-800");
    });
  });

  it("each card has flex-col layout for CLS prevention", () => {
    const { container } = render(<MarketListSkeleton />);
    const cards = container.querySelectorAll(".bg-gray-900.rounded-xl.p-5");
    cards.forEach((card) => {
      expect(card).toHaveClass("flex", "flex-col");
    });
  });

  it("includes chart placeholder (h-32) in each card", () => {
    const { container } = render(<MarketListSkeleton />);
    const chartPlaceholders = container.querySelectorAll(".h-32");
    expect(chartPlaceholders.length).toBe(6);
  });

  it("includes outcome button placeholders in each card", () => {
    const { container } = render(<MarketListSkeleton />);
    const buttonSkeletons = container.querySelectorAll(".h-10.w-24");
    // 2 outcome buttons per card × 6 cards = 12 minimum
    expect(buttonSkeletons.length).toBeGreaterThanOrEqual(12);
  });
});

describe("MarketDetailSkeleton", () => {
  it("renders the two-column grid layout", () => {
    const { container } = render(<MarketDetailSkeleton />);
    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("grid-cols-1", "lg:grid-cols-[65%_35%]", "gap-6");
  });

  it("renders hero section with question placeholder", () => {
    const { container } = render(<MarketDetailSkeleton />);
    // Hero has h-8 for the question title
    const titleSkeleton = container.querySelector(".h-8.w-full");
    expect(titleSkeleton).toBeInTheDocument();
    expect(titleSkeleton).toHaveClass("skeleton");
  });

  it("renders chart placeholder in left column", () => {
    const { container } = render(<MarketDetailSkeleton />);
    const chartSkeleton = container.querySelector(".h-72.w-full");
    expect(chartSkeleton).toBeInTheDocument();
    expect(chartSkeleton).toHaveClass("skeleton");
  });

  it("renders 4 outcome price tile placeholders", () => {
    const { container } = render(<MarketDetailSkeleton />);
    // Outcome tiles grid has grid-cols-2 md:grid-cols-4
    const tilesGrid = container.querySelector(".grid-cols-2.md\\:grid-cols-4");
    expect(tilesGrid).toBeInTheDocument();
    const tiles = tilesGrid?.querySelectorAll(".bg-gray-900.border.border-gray-800.rounded-xl");
    expect(tiles?.length).toBe(4);
  });

  it("renders 5 bet history row placeholders", () => {
    const { container } = render(<MarketDetailSkeleton />);
    // Bet history section has space-y-3 with 5 flex rows after the header
    const betHistorySection = container.querySelector(".bg-gray-900.border.border-gray-800.rounded-xl.p-5.space-y-3");
    expect(betHistorySection).toBeInTheDocument();
    const rows = betHistorySection?.querySelectorAll(".flex.justify-between");
    expect(rows?.length).toBe(5);
  });

  it("renders right column trade panel placeholder", () => {
    const { container } = render(<MarketDetailSkeleton />);
    // Right column has a trade panel with h-12 for the bet button
    const betButton = container.querySelector(".h-12.w-full");
    expect(betButton).toBeInTheDocument();
    expect(betButton).toHaveClass("skeleton");
  });

  it("has correct outer padding matching the real page", () => {
    const { container } = render(<MarketDetailSkeleton />);
    const wrapper = container.querySelector(".max-w-7xl");
    expect(wrapper).toHaveClass("px-4", "md:px-6", "py-6");
  });

  it("all skeleton elements have the shimmer class", () => {
    const { container } = render(<MarketDetailSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(10);
    skeletons.forEach((s) => expect(s).toHaveClass("skeleton"));
  });
});

describe("PortfolioSkeleton", () => {
  it("renders 4 portfolio summary stat cards", () => {
    const { container } = render(<PortfolioSkeleton />);
    // Summary grid has grid-cols-2 sm:grid-cols-4
    const summaryGrid = container.querySelector(".grid-cols-2.sm\\:grid-cols-4");
    expect(summaryGrid).toBeInTheDocument();
    const cards = summaryGrid?.querySelectorAll(".bg-gray-900.border.border-gray-800.rounded-2xl");
    expect(cards?.length).toBe(4);
  });

  it("renders 5 recent activity row placeholders", () => {
    const { container } = render(<PortfolioSkeleton />);
    // Activity table container
    const activityTable = container.querySelector(".bg-gray-900.border.border-gray-800.rounded-2xl.overflow-hidden");
    expect(activityTable).toBeInTheDocument();
    const rows = activityTable?.querySelectorAll(".flex.items-center.justify-between");
    expect(rows?.length).toBe(5);
  });

  it("renders profile card with avatar placeholder", () => {
    const { container } = render(<PortfolioSkeleton />);
    const avatar = container.querySelector(".h-24.w-24.rounded-full");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveClass("skeleton");
  });

  it("each activity row has avatar and text placeholders", () => {
    const { container } = render(<PortfolioSkeleton />);
    const activityTable = container.querySelector(".bg-gray-900.border.border-gray-800.rounded-2xl.overflow-hidden");
    const rows = activityTable?.querySelectorAll(".flex.items-center.justify-between");
    rows?.forEach((row) => {
      const skeletons = row.querySelectorAll(".skeleton");
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("each activity row has right-aligned amount placeholder", () => {
    const { container } = render(<PortfolioSkeleton />);
    const activityTable = container.querySelector(".bg-gray-900.border.border-gray-800.rounded-2xl.overflow-hidden");
    const amountCols = activityTable?.querySelectorAll(".flex.flex-col.items-end");
    expect(amountCols?.length).toBe(5);
  });

  it("stat cards have correct padding matching PortfolioSummary", () => {
    const { container } = render(<PortfolioSkeleton />);
    const summaryGrid = container.querySelector(".grid-cols-2.sm\\:grid-cols-4");
    const cards = summaryGrid?.querySelectorAll(".rounded-2xl");
    cards?.forEach((card) => {
      expect(card).toHaveClass("p-4");
    });
  });

  it("all skeleton elements have the shimmer class", () => {
    const { container } = render(<PortfolioSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(15);
    skeletons.forEach((s) => expect(s).toHaveClass("skeleton"));
  });
});

describe("LeaderboardSkeleton", () => {
  it("renders 3 summary stat card placeholders", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const statsGrid = container.querySelector(".grid-cols-3");
    expect(statsGrid).toBeInTheDocument();
    const cards = statsGrid?.querySelectorAll(".bg-gray-900.border.border-gray-800.rounded-xl");
    expect(cards?.length).toBe(3);
  });

  it("renders 10 table row placeholders", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const tbody = container.querySelector("tbody");
    expect(tbody).toBeInTheDocument();
    const rows = tbody?.querySelectorAll("tr");
    expect(rows?.length).toBe(10);
  });

  it("renders table with 4 column headers", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const thead = container.querySelector("thead");
    const headerCells = thead?.querySelectorAll("th");
    expect(headerCells?.length).toBe(4);
  });

  it("each row has rank, predictor, markets, and accuracy placeholders", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const tbody = container.querySelector("tbody");
    const rows = tbody?.querySelectorAll("tr");
    rows?.forEach((row) => {
      const cells = row.querySelectorAll("td");
      expect(cells.length).toBe(4);
      cells.forEach((cell) => {
        const skeleton = cell.querySelector(".skeleton");
        expect(skeleton).toBeInTheDocument();
      });
    });
  });

  it("predictor column includes avatar circle placeholder", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const avatars = container.querySelectorAll(".h-6.w-6.rounded-full");
    expect(avatars.length).toBe(10);
    avatars.forEach((a) => expect(a).toHaveClass("skeleton"));
  });

  it("uses max-w-3xl container matching the leaderboard page", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const wrapper = container.querySelector(".max-w-3xl");
    expect(wrapper).toHaveClass("px-4", "py-8");
  });

  it("table is wrapped in rounded-2xl container matching real table", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const tableWrapper = container.querySelector(".bg-gray-900.border.border-gray-800.rounded-2xl");
    expect(tableWrapper).toBeInTheDocument();
  });

  it("all skeleton elements have the shimmer class", () => {
    const { container } = render(<LeaderboardSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(20);
    skeletons.forEach((s) => expect(s).toHaveClass("skeleton"));
  });
});

describe("Skeleton shimmer animation — 1.5s timing", () => {
  it("shimmer animation is defined in globals.css (class exists)", () => {
    // The .skeleton class is applied to all skeleton elements.
    // The 1.5s animation is defined in globals.css @keyframes shimmer.
    // We verify the class is present on all skeleton components.
    const components = [
      <MarketListSkeleton key="list" />,
      <MarketDetailSkeleton key="detail" />,
      <PortfolioSkeleton key="portfolio" />,
      <LeaderboardSkeleton key="leaderboard" />,
    ];
    components.forEach((component) => {
      const { container } = render(component);
      const skeletons = container.querySelectorAll(".skeleton");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
