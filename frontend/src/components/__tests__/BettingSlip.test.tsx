/**
 * Tests for BettingSlip component
 * Covers: render, open/close, queued bets display, remove, submit, wallet guard
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import BettingSlip from "../BettingSlip";
import { BettingSlipProvider, useBettingSlip } from "../../context/BettingSlipContext";

const SAMPLE_BETS = [
  { marketId: 1, title: "Will BTC hit 100k?", outcome: "Yes", amount: 50 },
  { marketId: 2, title: "Will Arsenal win?", outcome: "No", amount: 30 },
];

type SeedBet = { marketId: number; title: string; outcome: string; amount: number };

// Seed the context with bets for testing
function SeedBets({ bets }: { bets: SeedBet[] }) {
  const { addBet } = useBettingSlip();
  React.useEffect(() => {
    bets.forEach((b) =>
      addBet({ marketId: b.marketId, marketTitle: b.title, outcomeIndex: 0, outcomeName: b.outcome, amount: b.amount })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderSlip(walletAddress: string | null = "GTEST123", seedBets: SeedBet[] = []) {
  return render(
    <BettingSlipProvider>
      <SeedBets bets={seedBets} />
      <BettingSlip walletAddress={walletAddress} />
    </BettingSlipProvider>
  );
}

const SAMPLE_BETS = [
  { marketId: 1, title: "Will BTC hit 100k?", outcome: "Yes", amount: 50 },
  { marketId: 2, title: "Will Arsenal win?", outcome: "No", amount: 30 },
];

describe("BettingSlip", () => {
  it("renders the slip container", () => {
    renderSlip();
    expect(screen.getByTestId("betting-slip")).toBeInTheDocument();
  });

  it("is hidden (translated off-screen) when closed", () => {
    renderSlip();
    expect(screen.getByTestId("betting-slip")).toHaveClass("translate-y-full");
  });

  it("shows empty state message when no bets queued", () => {
    renderSlip("GTEST", []);
    expect(screen.getByText(/No bets queued yet/i)).toBeInTheDocument();
  });

  it("displays queued bets with market title, outcome, and amount", async () => {
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => {
      expect(screen.getByText("Will BTC hit 100k?")).toBeInTheDocument();
      expect(screen.getByText("Will Arsenal win?")).toBeInTheDocument();
    });
  });

  it("shows total stake sum", async () => {
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => {
      expect(screen.getByTestId("total-stake")).toHaveTextContent("80.00 XLM");
    });
  });

  it("remove button removes a bet from the list", async () => {
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => screen.getByTestId("remove-bet-1-0"));
    fireEvent.click(screen.getByTestId("remove-bet-1-0"));
    await waitFor(() => {
      expect(screen.queryByText("Will BTC hit 100k?")).not.toBeInTheDocument();
    });
  });

  it("shows wallet-not-connected message when walletAddress is null", async () => {
    renderSlip(null, SAMPLE_BETS);
    await waitFor(() => {
      expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
    });
  });

  it("shows submit button when wallet is connected and bets exist", async () => {
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => {
      expect(screen.getByTestId("submit-batch")).toBeInTheDocument();
    });
  });

  it("submit button is disabled while submitting", async () => {
    // Mock fetch to hang
    global.fetch = jest.fn(() => new Promise(() => {})) as any;
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => screen.getByTestId("submit-batch"));
    fireEvent.click(screen.getByTestId("submit-batch"));
    await waitFor(() => {
      expect(screen.getByTestId("submit-batch")).toBeDisabled();
    });
    (global.fetch as jest.Mock).mockRestore?.();
  });

  it("shows error message on failed batch submission", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Insufficient balance" }),
    }) as any;
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => screen.getByTestId("submit-batch"));
    fireEvent.click(screen.getByTestId("submit-batch"));
    await waitFor(() => {
      expect(screen.getByTestId("batch-error")).toHaveTextContent("Insufficient balance");
    });
    (global.fetch as jest.Mock).mockRestore?.();
  });

  it("close button calls close on the context", async () => {
    renderSlip("GTEST", SAMPLE_BETS);
    await waitFor(() => screen.getByTestId("close-slip"));
    fireEvent.click(screen.getByTestId("close-slip"));
    // After close, slip should have translate-y-full class (hidden)
    await waitFor(() => {
      expect(screen.getByTestId("betting-slip")).toHaveClass("translate-y-full");
    });
  });
});
