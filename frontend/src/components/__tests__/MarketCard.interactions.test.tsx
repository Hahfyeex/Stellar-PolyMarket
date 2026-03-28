import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketCard from "../MarketCard";
import type { Market } from "../../types/market";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("next/link", () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

const mockSnapshotOdds = jest.fn();
const mockCheckSlippage = jest.fn(() => ({ exceeded: false, expectedPayout: 0, currentPayout: 0 }));
jest.mock("../../hooks/useSlippageGuard", () => ({
  useSlippageGuard: () => ({
    snapshotOdds: mockSnapshotOdds,
    checkSlippage: mockCheckSlippage,
  }),
}));

const mockSubmitOptimisticBet = jest.fn(() => Promise.resolve(true));
const mockBetsForMarket = jest.fn(() => []);
jest.mock("../../hooks/useOptimisticBet", () => ({
  useOptimisticBet: () => ({
    submitBet: mockSubmitOptimisticBet,
    betsForMarket: mockBetsForMarket,
  }),
}));

const mockSetOutcomeIndex = jest.fn();
const mockSetAmount = jest.fn();
const mockClearForm = jest.fn();
const mockSetSlippageTolerance = jest.fn();
let mockOutcomeIndex: number | null = null;
let mockAmount = "";

jest.mock("../../hooks/useFormPersistence", () => ({
  useFormPersistence: () => ({
    get outcomeIndex() { return mockOutcomeIndex; },
    get amount() { return mockAmount; },
    slippageTolerance: 0.05,
    setOutcomeIndex: mockSetOutcomeIndex,
    setAmount: mockSetAmount,
    setSlippageTolerance: mockSetSlippageTolerance,
    clearForm: mockClearForm,
  }),
}));

const mockAddBet = jest.fn();
jest.mock("../../context/BettingSlipContext", () => ({
  useBettingSlip: () => ({ addBet: mockAddBet }),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("../../components/ToastProvider", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    warning: jest.fn(),
  }),
}));

const mockCheckAndRun = jest.fn();
jest.mock("../../hooks/useTrustline", () => ({
  useTrustline: () => ({
    state: "idle",
    pendingAsset: null,
    errorMessage: null,
    checkAndRun: mockCheckAndRun,
    confirmTrustline: jest.fn(),
    dismiss: jest.fn(),
    retry: jest.fn(),
  }),
}));

jest.mock("../../hooks/useVolatilityPulse", () => ({
  useVolatilityPulse: jest.fn(() => ({ isPulsing: false, direction: null })),
}));

jest.mock("../../components/MarketResolutionTracker", () =>
  function MockMarketResolutionTracker() { return <div data-testid="market-resolution-tracker" />; }
);
jest.mock("../../components/PoolOwnershipChart", () =>
  function MockPoolOwnershipChart() { return <div data-testid="pool-ownership-chart" />; }
);
jest.mock("../../components/PayoutTooltip", () =>
  function MockPayoutTooltip() { return <div data-testid="payout-tooltip" />; }
);
jest.mock("../../components/TrustlineModal", () =>
  function MockTrustlineModal() { return <div data-testid="trustline-modal" />; }
);
jest.mock("../../components/SlippageWarningModal", () =>
  function MockSlippageWarningModal({ onCancel, onProceed }: { onCancel: () => void; onProceed: () => void }) {
    return (
      <div data-testid="slippage-warning-modal">
        <button onClick={onProceed}>Proceed</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
);
jest.mock("../../components/SlippageSettings", () =>
  function MockSlippageSettings() { return <div data-testid="slippage-settings" />; }
);
jest.mock("../../components/OptimisticBetIndicator", () =>
  function MockOptimisticBetIndicator() { return <div data-testid="optimistic-bet-indicator" />; }
);
jest.mock("../../components/WhatIfSimulator", () =>
  function MockWhatIfSimulator() { return <div data-testid="what-if-simulator" />; }
);
jest.mock("../../components/OddsTicker", () =>
  function MockOddsTicker() { return <div data-testid="odds-ticker" />; }
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

const marketWithAsset: Market = {
  ...baseMarket,
  asset: { code: "USDC", issuer: "GABC" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithWallet(market = baseMarket) {
  return render(<MarketCard market={market} walletAddress="wallet-123" />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MarketCard — share market", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = null;
    mockAmount = "";
  });

  it("copies to clipboard when navigator.share is unavailable", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithWallet();
    const shareBtn = screen.getByRole("button", { name: "" }); // SVG share button
    await act(async () => { fireEvent.click(shareBtn); });

    expect(writeText).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Market link copied to clipboard!");
  });

  it("shows error toast when share fails", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    renderWithWallet();
    const shareBtn = screen.getByRole("button", { name: "" });
    await act(async () => { fireEvent.click(shareBtn); });

    expect(mockToastError).toHaveBeenCalledWith("Failed to share market link.");
  });
});

describe("MarketCard — bet placement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "100";
    mockSubmitOptimisticBet.mockResolvedValue(true);
    mockCheckSlippage.mockReturnValue({ exceeded: false, expectedPayout: 0, currentPayout: 0 });
  });

  it("calls submitOptimisticBet with correct args when Bet is clicked", async () => {
    renderWithWallet();
    const betBtn = screen.getByRole("button", { name: /bet/i });
    await act(async () => { fireEvent.click(betBtn); });

    expect(mockSubmitOptimisticBet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: 42,
        outcomeIndex: 0,
        amount: 100,
        walletAddress: "wallet-123",
      }),
      expect.any(Function)
    );
  });

  it("shows success toast and clears form on successful bet", async () => {
    renderWithWallet();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });

    expect(mockToastSuccess).toHaveBeenCalledWith("Bet placed successfully!");
    expect(mockClearForm).toHaveBeenCalled();
  });

  it("does not call submitBet when no outcome selected", async () => {
    mockOutcomeIndex = null;
    renderWithWallet();
    const betBtn = screen.getByRole("button", { name: /bet/i });
    await act(async () => { fireEvent.click(betBtn); });
    expect(mockSubmitOptimisticBet).not.toHaveBeenCalled();
  });

  it("does not call submitBet when amount is empty", async () => {
    mockAmount = "";
    renderWithWallet();
    const betBtn = screen.getByRole("button", { name: /bet/i });
    await act(async () => { fireEvent.click(betBtn); });
    expect(mockSubmitOptimisticBet).not.toHaveBeenCalled();
  });

  it("shows slippage warning modal when slippage exceeded", async () => {
    mockCheckSlippage.mockReturnValue({ exceeded: true, expectedPayout: 110, currentPayout: 90 });
    renderWithWallet();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });

    expect(screen.getByTestId("slippage-warning-modal")).toBeInTheDocument();
    expect(mockSubmitOptimisticBet).not.toHaveBeenCalled();
  });

  it("dismisses slippage warning on cancel", async () => {
    mockCheckSlippage.mockReturnValue({ exceeded: true, expectedPayout: 110, currentPayout: 90 });
    renderWithWallet();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("slippage-warning-modal")).not.toBeInTheDocument();
  });

  it("uses checkAndRun when market has an asset", async () => {
    renderWithWallet(marketWithAsset);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });
    expect(mockCheckAndRun).toHaveBeenCalledWith(
      marketWithAsset.asset,
      "wallet-123",
      expect.any(Function)
    );
  });

  it("calls onBetPlaced callback after successful bet", async () => {
    const onBetPlaced = jest.fn();
    render(<MarketCard market={baseMarket} walletAddress="wallet-123" onBetPlaced={onBetPlaced} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });
    expect(onBetPlaced).toHaveBeenCalled();
  });
});

describe("MarketCard — clear form button", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "50";
  });

  it("calls clearForm when Clear form is clicked", () => {
    renderWithWallet();
    fireEvent.click(screen.getByText("Clear form"));
    expect(mockClearForm).toHaveBeenCalled();
  });
});

describe("MarketCard — snapshotOdds effect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "100";
  });

  it("calls snapshotOdds when outcome and amount are set", () => {
    renderWithWallet();
    expect(mockSnapshotOdds).toHaveBeenCalled();
  });
});

describe("MarketCard — WhatIfSimulator visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders WhatIfSimulator when outcome is selected on active market", () => {
    mockOutcomeIndex = 0;
    mockAmount = "10";
    renderWithWallet();
    expect(screen.getByTestId("what-if-simulator")).toBeInTheDocument();
  });

  it("does not render WhatIfSimulator when no outcome selected", () => {
    mockOutcomeIndex = null;
    mockAmount = "";
    renderWithWallet();
    expect(screen.queryByTestId("what-if-simulator")).not.toBeInTheDocument();
  });
});

describe("MarketCard — expired market", () => {
  it("disables outcome buttons when market is expired", () => {
    mockOutcomeIndex = null;
    mockAmount = "";
    const expiredMarket: Market = {
      ...baseMarket,
      end_date: new Date(Date.now() - 86400000).toISOString(),
    };
    render(<MarketCard market={expiredMarket} walletAddress="wallet-123" />);
    const buttons = screen.getAllByRole("button").filter((b) =>
      ["Yes", "No"].some((o) => b.textContent?.includes(o))
    );
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("does not render bet input for expired market", () => {
    const expiredMarket: Market = {
      ...baseMarket,
      end_date: new Date(Date.now() - 86400000).toISOString(),
    };
    render(<MarketCard market={expiredMarket} walletAddress="wallet-123" />);
    expect(screen.queryByPlaceholderText("Amount (XLM)")).not.toBeInTheDocument();
  });
});

describe("MarketCard — native share", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = null;
    mockAmount = "";
  });

  it("calls navigator.share when available", async () => {
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: mockShare, configurable: true });

    renderWithWallet();
    const shareBtn = screen.getByRole("button", { name: "" });
    await act(async () => { fireEvent.click(shareBtn); });

    expect(mockShare).toHaveBeenCalled();
  });
});

describe("MarketCard — failed bet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "100";
    mockCheckSlippage.mockReturnValue({ exceeded: false, expectedPayout: 0, currentPayout: 0 });
  });

  it("does not show success toast when bet fails", async () => {
    mockSubmitOptimisticBet.mockResolvedValue(false);
    renderWithWallet();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockClearForm).not.toHaveBeenCalled();
  });
});

describe("MarketCard — slippage proceed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "100";
    mockCheckSlippage.mockReturnValue({ exceeded: true, expectedPayout: 110, currentPayout: 90 });
    mockSubmitOptimisticBet.mockResolvedValue(true);
  });

  it("proceeds with bet after confirming slippage warning", async () => {
    renderWithWallet();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });
    expect(screen.getByTestId("slippage-warning-modal")).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /proceed/i })); });
    expect(mockSubmitOptimisticBet).toHaveBeenCalled();
  });
});

describe("MarketCard — loading state during bet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutcomeIndex = 0;
    mockAmount = "100";
    mockCheckSlippage.mockReturnValue({ exceeded: false, expectedPayout: 0, currentPayout: 0 });
  });

  it("shows Placing... text while bet is in flight", async () => {
    // Never resolves during this test — simulates loading state
    mockSubmitOptimisticBet.mockImplementation(
      () => new Promise(() => {}) // pending forever
    );
    renderWithWallet();
    act(() => { fireEvent.click(screen.getByRole("button", { name: /bet/i })); });
    await waitFor(() => expect(screen.getByText("Placing...")).toBeInTheDocument());
  });
});
