"use client";
import { useEffect, useState } from "react";
import { useWallet } from "../hooks/useWallet";
import MarketCard from "../components/MarketCard";
import LiveActivityFeed from "../components/LiveActivityFeed";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
}

export default function Home() {
  const { publicKey, connecting, error, connect, disconnect } = useWallet();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchMarkets() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`);
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch {
      // API not running yet — show demo markets
      setMarkets(DEMO_MARKETS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchMarkets(); }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <span className="text-xl font-bold text-blue-400">Stella Polymarket</span>
        {publicKey ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
            </span>
            <button
              onClick={disconnect}
              className="text-sm border border-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-400"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </nav>

      {error && (
        <div className="max-w-4xl mx-auto px-4 mt-4">
          <p className="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>
        </div>
      )}

      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <h1 className="text-5xl font-bold mb-3">Predict. Stake. Earn.</h1>
        <p className="text-xl text-gray-400 max-w-xl">
          Decentralized prediction markets on Stellar. Fast, cheap, and transparent.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4 max-w-2xl mx-auto px-4 pb-12 text-center">
        {[
          { label: "Active Markets", value: markets.filter((m) => !m.resolved).length },
          { label: "Total Staked", value: `${markets.reduce((s, m) => s + parseFloat(m.total_pool || "0"), 0).toFixed(0)} XLM` },
          { label: "Markets", value: markets.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 rounded-xl p-5">
            <p className="text-3xl font-bold text-blue-400">{stat.value}</p>
            <p className="text-gray-400 mt-1 text-sm">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* Markets + Activity layout */}
      <section className="max-w-6xl mx-auto px-4 pb-16 flex flex-col lg:flex-row gap-6">
        {/* Markets */}
        <div className="flex-1">
          <h2 className="text-2xl font-semibold mb-6">Open Markets</h2>
          {loading ? (
            <p className="text-gray-400">Loading markets...</p>
          ) : markets.length === 0 ? (
            <p className="text-gray-400">No markets yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {markets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  walletAddress={publicKey}
                  onBetPlaced={fetchMarkets}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Activity Feed */}
        <div className="w-full lg:w-80 shrink-0">
          <h2 className="text-2xl font-semibold mb-6">Recent Activity</h2>
          <LiveActivityFeed apiUrl={process.env.NEXT_PUBLIC_API_URL} />
        </div>
      </section>
    </main>
  );
}

// Demo data when API is offline
const DEMO_MARKETS: Market[] = [
  {
    id: 1,
    question: "Will Bitcoin reach $100k before 2027?",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "4200",
  },
  {
    id: 2,
    question: "Will Nigeria inflation drop below 15% this year?",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "1800",
  },
  {
    id: 3,
    question: "Will Arsenal win the Premier League?",
    end_date: "2026-05-30T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "3100",
  },
];
