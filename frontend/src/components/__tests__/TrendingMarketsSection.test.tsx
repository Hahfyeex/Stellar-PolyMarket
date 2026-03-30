import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TrendingMarketsSection from "../TrendingMarketsSection";

// Mock the hook
jest.mock("../../hooks/useTrendingMarkets");
const { useTrendingMarkets } = require("../../hooks/useTrendingMarkets");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const MOCK_MARKETS = [
  {
    id: 1,
    question: "Will BTC reach $100k?",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "5000",
    volume_24h: "1200.5",
    bet_count: 42,
    end_date: "2027-01-01T00:00:00Z",
  },
  {
    id: 2,
    question: "Will ETH flip BTC?",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "3000",
    volume_24h: "800",
    bet_count: 28,
    end_date: "2027-01-01T00:00:00Z",
  },
];

describe("TrendingMarketsSection", () => {
  afterEach(() => jest.clearAllMocks());

  test("renders trending cards with fire badge and 24h volume", () => {
    useTrendingMarkets.mockReturnValue({ data: MOCK_MARKETS, isLoading: false, error: null });

    render(<TrendingMarketsSection />, { wrapper });

    expect(screen.getByText("🔥 Trending Markets")).toBeInTheDocument();
    expect(screen.getAllByText("🔥 Trending")).toHaveLength(2);
    expect(screen.getByText("Will BTC reach $100k?")).toBeInTheDocument();
    expect(screen.getByText(/1200/)).toBeInTheDocument();
  });

  test("renders See All Trending link pointing to /markets?sort=trending", () => {
    useTrendingMarkets.mockReturnValue({ data: MOCK_MARKETS, isLoading: false, error: null });

    render(<TrendingMarketsSection />, { wrapper });

    const link = screen.getByRole("link", { name: /see all trending/i });
    expect(link).toHaveAttribute("href", "/markets?sort=trending");
  });

  test("renders loading skeletons while fetching", () => {
    useTrendingMarkets.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render(<TrendingMarketsSection />, { wrapper });

    expect(screen.getByText("🔥 Trending Markets")).toBeInTheDocument();
    // No market cards yet
    expect(screen.queryByText("Will BTC reach $100k?")).not.toBeInTheDocument();
  });

  test("renders nothing on error or empty data", () => {
    useTrendingMarkets.mockReturnValue({ data: [], isLoading: false, error: null });

    const { container } = render(<TrendingMarketsSection />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  test("limits display to 6 cards even if more are returned", () => {
    const manyMarkets = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      question: `Market ${i + 1}`,
      outcomes: ["Yes", "No"],
      resolved: false,
      winning_outcome: null,
      total_pool: "1000",
      volume_24h: "500",
      bet_count: 10,
      end_date: "2027-01-01T00:00:00Z",
    }));
    useTrendingMarkets.mockReturnValue({ data: manyMarkets, isLoading: false, error: null });

    render(<TrendingMarketsSection />, { wrapper });

    expect(screen.getAllByText("🔥 Trending")).toHaveLength(6);
  });
});
