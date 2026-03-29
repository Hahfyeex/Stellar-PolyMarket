import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TransactionHistoryPage, { explorerUrl } from "../../app/profile/[address]/transactions/page";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useParams: () => ({ address: "GTEST123456789ABCDEF" }),
}));

// Mock fetch
global.fetch = jest.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const MOCK_TXS = [
  {
    id: 1,
    created_at: "2026-01-15T10:00:00Z",
    type: "bet",
    market_question: "Will BTC reach $100k?",
    amount: "100",
    transaction_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  },
  {
    id: 2,
    created_at: "2026-01-20T12:00:00Z",
    type: "payout",
    market_question: "Will ETH flip BTC?",
    amount: "250",
    transaction_hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
  },
];

describe("explorerUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_STELLAR_NETWORK;

  afterEach(() => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = originalEnv;
  });

  test("generates testnet URL when network is not mainnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    const url = explorerUrl("abc123");
    expect(url).toBe("https://stellar.expert/explorer/testnet/tx/abc123");
  });

  test("generates mainnet URL when network is mainnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "mainnet";
    const url = explorerUrl("abc123");
    expect(url).toBe("https://stellar.expert/explorer/public/tx/abc123");
  });
});

describe("TransactionHistoryPage", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ bets: MOCK_TXS }),
    });
  });

  afterEach(() => jest.clearAllMocks());

  test("renders all transactions by default", async () => {
    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Will BTC reach $100k?")).toBeInTheDocument();
      expect(screen.getByText("Will ETH flip BTC?")).toBeInTheDocument();
    });
  });

  test("type filter: Bets shows only bet transactions", async () => {
    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => screen.getByText("Will BTC reach $100k?"));

    fireEvent.click(screen.getByTestId("filter-bet"));

    expect(screen.getByText("Will BTC reach $100k?")).toBeInTheDocument();
    expect(screen.queryByText("Will ETH flip BTC?")).not.toBeInTheDocument();
  });

  test("type filter: Payouts shows only payout transactions", async () => {
    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => screen.getByText("Will ETH flip BTC?"));

    fireEvent.click(screen.getByTestId("filter-payout"));

    expect(screen.queryByText("Will BTC reach $100k?")).not.toBeInTheDocument();
    expect(screen.getByText("Will ETH flip BTC?")).toBeInTheDocument();
  });

  test("type filter: All restores all transactions", async () => {
    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => screen.getByText("Will BTC reach $100k?"));

    fireEvent.click(screen.getByTestId("filter-bet"));
    fireEvent.click(screen.getByTestId("filter-all"));

    expect(screen.getByText("Will BTC reach $100k?")).toBeInTheDocument();
    expect(screen.getByText("Will ETH flip BTC?")).toBeInTheDocument();
  });

  test("renders explorer links pointing to correct network", async () => {
    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => screen.getByText("Will BTC reach $100k?"));

    const explorerLinks = screen.getAllByRole("link", { name: /stellar explorer/i });
    expect(explorerLinks.length).toBeGreaterThan(0);
    explorerLinks.forEach((link) => {
      expect(link.getAttribute("href")).toMatch(/stellar\.expert\/explorer\/(testnet|public)\/tx\//);
    });
  });

  test("shows empty state when no transactions", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ bets: [] }),
    });

    render(<TransactionHistoryPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();
    });
  });
});
