import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketCard from "../MarketCard";
import { MarketCardSkeleton } from "../skeletons/MarketCardSkeleton";
import type { Market } from "../../types/market";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../../hooks/useVolatilityPulse", () => ({
  useVolatilityPulse: jest.fn(() => ({ isPulsing: false, direction: null })),
}));

jest.mock("../../hooks/useFormPersistence", () => ({
  useFormPersistence: () => ({
    outcomeIndex: null,
    amount: "",
    slippageTolerance: 0.05,
    setOutcomeIndex: jest.fn(),
    setAmount: jest.fn(),
    setSlippageTolerance: jest.fn(),
    clearForm: jest.fn(),
  }),
}));

jest.mock("../../context/BettingSlipContext", () => ({
  useBettingSlip: () => ({ addBet: jest.fn() }),
}));

jest.mock("../../hooks/useTrustline", () => ({
  useTrustline: () => ({
    state: "idle",
    pendingAsset: null,
    errorMessage: null,
    checkAndRun: jest.fn(),
    confirmTrustline: jest.fn(),
    dismiss: jest.fn(),
    retry: jest.fn(),
  }),
}));

jest.mock("../../hooks/useSlippageGuard", () => ({
  useSlippageGuard: () => ({
    snapshotOdds: jest.fn(),
    checkSlippage: jest.fn(() => ({ exceeded: false })),
  }),
}));

jest.mock("../../hooks/useOptimisticBet", () => ({
  useOptimisticBet: () => ({
    submitBet: jest.fn(),
    betsForMarket: jest.fn(() => []),
  }),
}));

jest.mock("../../components/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), warning: jest.fn() }),
}));

jest.mock("../../components/MarketResolutionTracker", () =>
  function MockMarketResolutionTracker() {
    return <div data-testid="market-resolution-tracker" />;
  }
);

jest.mock("../../components/PoolOwnershipChart", () =>
  function MockPoolOwnershipChart() {
    return <div data-testid="pool-ownership-chart" />;
  }
);

jest.mock("../../components/PayoutTooltip", () =>
  function MockPayoutTooltip() {
    return <div data-testid="payout-tooltip" />;
  }
);

jest.mock("../../components/TrustlineModal", () =>
  function MockTrustlineModal() {
    return <div data-testid="trustline-modal" />;
  }
);

jest.mock("../../components/SlippageWarningModal", () =>
  function MockSlippageWarningModal() {
    return <div data-testid="slippage-warning-modal" />;
  }
);

jest.mock("../../components/SlippageSettings", () =>
  function MockSlippageSettings() {
    return <div data-testid="slippage-settings" />;
  }
);

jest.mock("../../components/OptimisticBetIndicator", () =>
  function MockOptimisticBetIndicator() {
    return <div data-testid="optimistic-bet-indicator" />;
  }
);

jest.mock("../../hooks/useOddsStream", () => ({
  useOddsStream: jest.fn(() => ({
    odds: [],
    connected: false,
    changedIndices: new Set(),
  })),
}));

jest.mock("../../components/WhatIfSimulator", () =>
  function MockWhatIfSimulator() {
    return <div data-testid="what-if-simulator" />;
  }
);

jest.mock("../../components/OddsTicker", () =>
  function MockOddsTicker() {
    return <div data-testid="odds-ticker" />;
  }
);

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("next/link", () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

jest.mock("../../lib/firebase", () => ({ trackEvent: jest.fn() }));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseMarket: Market = {
  id: 42,
  question: "Will ETH hit $10k?",
  end_date: new Date(Date.now() + 86400000).toISOString(),
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "2000",
  status: "active",
};

const resolvedMarket: Market = {
  ...baseMarket,
  resolved: true,
  winning_outcome: 0,
};

// ── State: Loading (skeleton) ─────────────────────────────────────────────────

describe("MarketCardSkeleton — loading state", () => {
  it("renders the skeleton wrapper with correct classes", () => {
    const { container } = render(<MarketCardSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("bg-gray-900", "rounded-xl", "p-5", "border", "border-gray-800");
  });

  it("renders at least 8 shimmer skeleton elements", () => {
    const { container } = render(<MarketCardSkeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(8);
  });

  it("includes a placeholder for the pool ownership chart area", () => {
    const { container } = render(<MarketCardSkeleton />);
    // The chart placeholder is h-32 w-full
    const chartPlaceholder = container.querySelector(".h-32");
    expect(chartPlaceholder).toBeInTheDocument();
  });

  it("includes outcome button placeholders", () => {
    const { container } = render(<MarketCardSkeleton />);
    const buttonPlaceholders = container.querySelectorAll(".h-10");
    expect(buttonPlaceholders.length).toBeGreaterThanOrEqual(2);
  });

  it("matches the card outer layout (no layout shift)", () => {
    const { container } = render(<MarketCardSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("flex", "flex-col", "gap-3");
  });
});

// ── State: Error ──────────────────────────────────────────────────────────────

describe("MarketCard — error state", () => {
  it("renders error message when isError is true", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} isError />);
    expect(screen.getByText("Failed to load market")).toBeInTheDocument();
  });

  it("renders Retry button when onRetry is provided", () => {
    const onRetry = jest.fn();
    render(<MarketCard market={baseMarket} walletAddress={null} isError onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls onRetry when Retry button is clicked", () => {
    const onRetry = jest.fn();
    render(<MarketCard market={baseMarket} walletAddress={null} isError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render Retry button when onRetry is not provided", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} isError />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders error card with red border", () => {
    const { container } = render(
      <MarketCard market={baseMarket} walletAddress={null} isError />
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("border-red-800");
  });

  it("does not render market question in error state", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} isError />);
    expect(screen.queryByText(baseMarket.question)).not.toBeInTheDocument();
  });
});

// ── State: Resolved ───────────────────────────────────────────────────────────

describe("MarketCard — resolved state", () => {
  it("renders the Resolved badge when market.resolved is true", () => {
    render(<MarketCard market={resolvedMarket} walletAddress={null} />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("Resolved badge has correct green pill styling", () => {
    render(<MarketCard market={resolvedMarket} walletAddress={null} />);
    const badge = screen.getByText("Resolved");
    expect(badge).toHaveClass("bg-green-800", "text-green-300", "rounded-full");
  });

  it("does not render Resolved badge for active market", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
  });

  it("disables outcome buttons when market is resolved", () => {
    render(<MarketCard market={resolvedMarket} walletAddress="wallet-123" />);
    const buttons = screen.getAllByRole("button").filter((b) =>
      ["Yes", "No"].some((o) => b.textContent?.includes(o))
    );
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("does not render bet input for resolved market", () => {
    render(<MarketCard market={resolvedMarket} walletAddress="wallet-123" />);
    expect(screen.queryByPlaceholderText("Amount (XLM)")).not.toBeInTheDocument();
  });
});

// ── State: Active ─────────────────────────────────────────────────────────────

describe("MarketCard — active state", () => {
  it("renders the market question", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    expect(screen.getByText(baseMarket.question)).toBeInTheDocument();
  });

  it("renders pool total", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    expect(screen.getByText("2000.00 XLM")).toBeInTheDocument();
  });

  it("renders outcome buttons", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders bet input when wallet is connected and market is active", () => {
    render(<MarketCard market={baseMarket} walletAddress="wallet-123" />);
    expect(screen.getByPlaceholderText("Amount (XLM)")).toBeInTheDocument();
  });

  it("does not render bet input when wallet is not connected", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    expect(screen.queryByPlaceholderText("Amount (XLM)")).not.toBeInTheDocument();
  });

  it("renders View Details link pointing to correct market URL", () => {
    render(<MarketCard market={baseMarket} walletAddress={null} />);
    const link = screen.getByRole("link", { name: /view details/i });
    expect(link).toHaveAttribute("href", `/market/${baseMarket.id}`);
  });
});

// ── Keyboard Navigation ───────────────────────────────────────────────────────

describe("MarketCard — keyboard navigation", () => {
  beforeEach(() => mockPush.mockClear());

  it("card has tabIndex=0 for keyboard focus", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("navigates to market detail on Enter key", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith(`/market/${baseMarket.id}`);
  });

  it("navigates to market detail on Space key", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    fireEvent.keyDown(card, { key: " " });
    expect(mockPush).toHaveBeenCalledWith(`/market/${baseMarket.id}`);
  });

  it("does not navigate on other keys", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    fireEvent.keyDown(card, { key: "Tab" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("card has role=article", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("role", "article");
  });

  it("card has aria-label set to market question", () => {
    const { container } = render(<MarketCard market={baseMarket} walletAddress={null} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("aria-label", baseMarket.question);
  });
});
