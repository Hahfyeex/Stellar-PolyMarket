import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketCard from "../MarketCard";
import type { Market } from "../../types/market";

// Mock dependencies
jest.mock("../../hooks/useVolatilityPulse", () => ({
  useVolatilityPulse: jest.fn(),
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
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock("../../components/MarketResolutionTracker", () => {
  return function MockMarketResolutionTracker() {
    return <div data-testid="market-resolution-tracker" />;
  };
});

jest.mock("../../components/PoolOwnershipChart", () => {
  return function MockPoolOwnershipChart() {
    return <div data-testid="pool-ownership-chart" />;
  };
});

jest.mock("../../components/PayoutTooltip", () => {
  return function MockPayoutTooltip() {
    return <div data-testid="payout-tooltip" />;
  };
});

jest.mock("../../components/TrustlineModal", () => {
  return function MockTrustlineModal() {
    return <div data-testid="trustline-modal" />;
  };
});

jest.mock("../../components/SlippageWarningModal", () => {
  return function MockSlippageWarningModal() {
    return <div data-testid="slippage-warning-modal" />;
  };
});

jest.mock("../../components/SlippageSettings", () => {
  return function MockSlippageSettings() {
    return <div data-testid="slippage-settings" />;
  };
});

jest.mock("../../components/OptimisticBetIndicator", () => {
  return function MockOptimisticBetIndicator() {
    return <div data-testid="optimistic-bet-indicator" />;
  };
});

jest.mock("../../components/WhatIfSimulator", () => {
  return function MockWhatIfSimulator() {
    return <div data-testid="what-if-simulator" />;
  };
});

jest.mock("../../components/OddsTicker", () => {
  return function MockOddsTicker() {
    return <div data-testid="odds-ticker" />;
  };
});

jest.mock("next/link", () => {
  return function MockLink({ children, href }: any) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../lib/firebase", () => ({
  trackEvent: jest.fn(),
}));

const mockMarket: Market = {
  id: 1,
  question: "Will Bitcoin reach $100k?",
  end_date: new Date(Date.now() + 86400000).toISOString(),
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "1000",
  status: "active",
};

describe("MarketCard - Volatility Pulse Animation", () => {
  const { useVolatilityPulse } = require("../../hooks/useVolatilityPulse");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should apply pulse-green class when pulsing up", () => {
    useVolatilityPulse.mockReturnValue({
      isPulsing: true,
      direction: "up",
    });

    const { container } = render(
      <MarketCard market={mockMarket} walletAddress="test-wallet" />
    );

    const cardDiv = container.querySelector(".pulse-green");
    expect(cardDiv).toBeInTheDocument();
  });

  it("should apply pulse-red class when pulsing down", () => {
    useVolatilityPulse.mockReturnValue({
      isPulsing: true,
      direction: "down",
    });

    const { container } = render(
      <MarketCard market={mockMarket} walletAddress="test-wallet" />
    );

    const cardDiv = container.querySelector(".pulse-red");
    expect(cardDiv).toBeInTheDocument();
  });

  it("should not apply pulse class when not pulsing", () => {
    useVolatilityPulse.mockReturnValue({
      isPulsing: false,
      direction: null,
    });

    const { container } = render(
      <MarketCard market={mockMarket} walletAddress="test-wallet" />
    );

    const cardDiv = container.querySelector(".pulse-green");
    const cardDivRed = container.querySelector(".pulse-red");
    expect(cardDiv).not.toBeInTheDocument();
    expect(cardDivRed).not.toBeInTheDocument();
  });

  it("should call useVolatilityPulse with default odds", () => {
    useVolatilityPulse.mockReturnValue({
      isPulsing: false,
      direction: null,
    });

    render(<MarketCard market={mockMarket} walletAddress="test-wallet" />);

    // Default odds = 100 / 2 outcomes = 50
    expect(useVolatilityPulse).toHaveBeenCalledWith(50);
  });

  it("should calculate correct default odds for multi-outcome market", () => {
    const multiOutcomeMarket: Market = {
      ...mockMarket,
      outcomes: ["A", "B", "C", "D"],
    };

    useVolatilityPulse.mockReturnValue({
      isPulsing: false,
      direction: null,
    });

    render(<MarketCard market={multiOutcomeMarket} walletAddress="test-wallet" />);

    // Default odds = 100 / 4 outcomes = 25
    expect(useVolatilityPulse).toHaveBeenCalledWith(25);
  });

  it("should maintain pulse animation class on card element", () => {
    useVolatilityPulse.mockReturnValue({
      isPulsing: true,
      direction: "up",
    });

    const { container } = render(
      <MarketCard market={mockMarket} walletAddress="test-wallet" />
    );

    const cardDiv = container.firstChild as HTMLElement;
    expect(cardDiv.className).toContain("pulse-green");
    expect(cardDiv.className).toContain("bg-gray-900");
    expect(cardDiv.className).toContain("rounded-xl");
  });

  it("should switch pulse direction when direction changes", () => {
    const { rerender, container } = render(
      <MarketCard market={mockMarket} walletAddress="test-wallet" />
    );

    // Start with up pulse
    useVolatilityPulse.mockReturnValue({
      isPulsing: true,
      direction: "up",
    });

    rerender(<MarketCard market={mockMarket} walletAddress="test-wallet" />);
    expect(container.querySelector(".pulse-green")).toBeInTheDocument();

    // Switch to down pulse
    useVolatilityPulse.mockReturnValue({
      isPulsing: true,
      direction: "down",
    });

    rerender(<MarketCard market={mockMarket} walletAddress="test-wallet" />);
    expect(container.querySelector(".pulse-red")).toBeInTheDocument();
  });
});
