"use client";

import PortfolioDashboard from "../../components/PortfolioDashboard";
import { useWalletContext } from "../../context/WalletContext";
import { PortfolioPosition } from "../../utils/portfolio";

const MOCK_PORTFOLIO_POSITIONS: PortfolioPosition[] = [
  {
    id: "1",
    marketTitle: "Will BTC close above $120k before July 2026?",
    stakeAmount: 120,
    currentValue: 198,
    outcomeLabel: "Yes",
    status: "won",
    openedAt: "2026-03-01T12:00:00.000Z",
    resolvedAt: "2026-03-08T12:00:00.000Z",
  },
  {
    id: "2",
    marketTitle: "Will Arsenal win the league this season?",
    stakeAmount: 90,
    currentValue: 0,
    outcomeLabel: "Yes",
    status: "lost",
    openedAt: "2026-03-05T12:00:00.000Z",
    resolvedAt: "2026-03-12T12:00:00.000Z",
  },
  {
    id: "3",
    marketTitle: "Will NGN strengthen against USD this month?",
    stakeAmount: 75,
    currentValue: 84,
    outcomeLabel: "No",
    status: "pending",
    openedAt: "2026-03-20T12:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: "4",
    marketTitle: "Will rainfall exceed seasonal average in Lagos next week?",
    stakeAmount: 55,
    currentValue: 111,
    outcomeLabel: "Yes",
    status: "won",
    openedAt: "2026-02-12T12:00:00.000Z",
    resolvedAt: "2026-02-20T12:00:00.000Z",
  },
];

export default function PortfolioPage() {
  const { publicKey, connect, connecting } = useWalletContext();

  if (!publicKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6">
        <div className="max-w-md rounded-[28px] border border-gray-800 bg-gray-900/85 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
            Portfolio
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Connect your wallet to view P&amp;L</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            The dashboard uses your connected account to load all open and resolved positions.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="mt-6 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {connecting ? "Connecting..." : "Connect Freighter"}
          </button>
        </div>
      </main>
    );
  }

  return <PortfolioDashboard positions={MOCK_PORTFOLIO_POSITIONS} />;
}
