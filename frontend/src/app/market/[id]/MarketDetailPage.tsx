"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useWallet } from "../../../hooks/useWallet";
import { formatWallet, formatRelativeTime } from "../../../hooks/useRecentActivity";
import MobileShell from "../../../components/mobile/MobileShell";
import OddsTicker from "../../../components/OddsTicker";
import BetConfirmationModal from "../../../components/BetConfirmationModal";
import { useMarket } from "../../../hooks/useMarket";
import { usePlaceBet } from "../../../hooks/usePlaceBet";
import { useToast } from "../../../components/ToastProvider";


// =============================================================================
// Types
// =============================================================================

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status: string;
  contract_address: string | null;
  created_at: string;
}

interface Bet {
  id: number;
  wallet_address: string;
  outcome_index: number;
  amount: string;
  created_at: string;
}

interface Position {
  wallet_address: string;
  outcome_index: number;
  total_amount: number;
  bet_count: number;
}

// =============================================================================
// Demo Data
// =============================================================================

async function fetchPoolSize(marketId: number): Promise<{ pool_size: string }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reserves`);
  if (!res.ok) throw new Error("Failed to fetch reserves");
  const data = await res.json();
  const marketReserve = data.markets?.find((m: any) => m.market_id === marketId);
  return { pool_size: marketReserve?.xlm_balance ?? "0" };
}

const DEMO_MARKET: Market = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
  status: "open",
  contract_address: "GXXXX...XXXX",
  created_at: "2024-01-15T00:00:00Z",
};

const DEMO_BETS: Bet[] = [
  {
    id: 1,
    wallet_address: "GABC1234ABCD",
    outcome_index: 0,
    amount: "100",
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 2,
    wallet_address: "GDEF5678EFGH",
    outcome_index: 1,
    amount: "50",
    created_at: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 3,
    wallet_address: "GIJK9012IJKL",
    outcome_index: 0,
    amount: "200",
    created_at: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: 4,
    wallet_address: "GMNO3456MNOP",
    outcome_index: 0,
    amount: "75",
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 5,
    wallet_address: "GQRST7890STU",
    outcome_index: 1,
    amount: "150",
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
];

// =============================================================================
// Odds Calculator
// =============================================================================

function calculateOdds(bets: Bet[], outcomeIndex: number): number {
  const totalPool = bets.reduce((sum, bet) => sum + parseFloat(bet.amount), 0);
  if (totalPool === 0) return 0.5;

  const outcomeStake = bets
    .filter((bet) => bet.outcome_index === outcomeIndex)
    .reduce((sum, bet) => sum + parseFloat(bet.amount), 0);

  return outcomeStake / totalPool;
}

function calculatePositions(bets: Bet[]): Position[] {
  const positionMap = new Map<string, Position>();

  bets.forEach((bet) => {
    const key = `${bet.wallet_address}-${bet.outcome_index}`;
    const existing = positionMap.get(key);
    if (existing) {
      existing.total_amount += parseFloat(bet.amount);
      existing.bet_count += 1;
    } else {
      positionMap.set(key, {
        wallet_address: bet.wallet_address,
        outcome_index: bet.outcome_index,
        total_amount: parseFloat(bet.amount),
        bet_count: 1,
      });
    }
  });

  return Array.from(positionMap.values()).sort((a, b) => b.total_amount - a.total_amount);
}

// =============================================================================
// Tab Components
// =============================================================================

interface TabProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function Tab({ active, onClick, label }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
        active
          ? "border-blue-500 text-white"
          : "border-transparent text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

interface AboutTabProps {
  market: Market;
  poolSize: string;
}

function AboutTab({ market, poolSize }: AboutTabProps) {
  return (
    <div className="space-y-6">
      {/* Market Question */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Question</h3>
        <p className="text-white text-lg leading-relaxed">{market.question}</p>
      </div>

      {/* Market Info */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-4">
        <h3 className="text-lg font-semibold text-white">Market Details</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm">Pool Size</p>
            <p className="text-white font-semibold text-xl">
              {parseFloat(poolSize).toFixed(2)} XLM
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Total Staked</p>
            <p className="text-white font-semibold text-xl">
              {parseFloat(market.total_pool).toFixed(2)} XLM
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm">Ends</p>
            <p className="text-white font-medium">
              {new Date(market.end_date).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Status</p>
            <span
              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                market.resolved ? "badge-fade-in" : ""
              } ${
                market.resolved
                  ? "bg-green-800 text-green-300"
                  : new Date(market.end_date) <= new Date()
                    ? "bg-yellow-800 text-yellow-300"
                    : "bg-blue-800 text-blue-300"
              }`}
            >
              {market.resolved
                ? "Resolved"
                : new Date(market.end_date) <= new Date()
                  ? "Ended"
                  : "Active"}
            </span>
          </div>
        </div>

        {market.contract_address && (
          <div>
            <p className="text-gray-400 text-sm">Contract</p>
            <p className="text-gray-300 font-mono text-sm break-all">{market.contract_address}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface PositionsTabProps {
  positions: Position[];
  outcomes: string[];
}

function PositionsTab({ positions, outcomes }: PositionsTabProps) {
  if (positions.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
        <p className="text-gray-400">No positions yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                Trader
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                Position
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                Amount
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                Bets
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {positions.map((position) => (
              <tr key={`${position.wallet_address}-${position.outcome_index}`}>
                <td className="px-4 py-4">
                  <span className="text-white font-mono text-sm">
                    {formatWallet(position.wallet_address)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      position.outcome_index === 0
                        ? "bg-green-900 text-green-300"
                        : "bg-red-900 text-red-300"
                    }`}
                  >
                    {outcomes[position.outcome_index] || `Option ${position.outcome_index + 1}`}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-white font-semibold">
                    {position.total_amount.toFixed(2)} XLM
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-gray-400">{position.bet_count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ActivityTabProps {
  bets: Bet[];
  outcomes: string[];
}

function ActivityTab({ bets, outcomes }: ActivityTabProps) {
  if (bets.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
        <p className="text-gray-400">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="divide-y divide-gray-800">
        {bets.map((bet) => (
          <div key={bet.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  bet.outcome_index === 0
                    ? "bg-green-900 text-green-300"
                    : "bg-red-900 text-red-300"
                }`}
              >
                {outcomes[bet.outcome_index]?.[0] || "?"}
              </div>
              <div>
                <p className="text-white font-medium">
                  <span className="font-mono text-sm">{formatWallet(bet.wallet_address)}</span>
                  <span className="text-gray-400 ml-2 text-sm">
                    bet on {outcomes[bet.outcome_index] || `Option ${bet.outcome_index + 1}`}
                  </span>
                </p>
                <p className="text-gray-500 text-xs">{formatRelativeTime(bet.created_at)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold">{parseFloat(bet.amount).toFixed(2)} XLM</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Betting Panel
// =============================================================================

interface BettingPanelProps {
  market: Market;
  odds: { yes: number; no: number };
  onBetPlaced: () => void;
}

const HORIZON = "https://horizon-testnet.stellar.org";

function BettingPanel({ market, odds, onBetPlaced }: BettingPanelProps) {
  const { publicKey, connecting, connect } = useWallet();
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);


  const betMutation = usePlaceBet(market.id);

  // Sync mutation state to local message
  useEffect(() => {
    if (betMutation.isSuccess) {
      toastSuccess("Bet placed successfully!");
      setSelectedOutcome(null);
      setAmount("");
      onBetPlaced();
      setIsConfirmModalOpen(false);
    }
    if (betMutation.isError) {
      toastError((betMutation.error as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betMutation.isSuccess, betMutation.isError]);

  function handleBet() {
    if (selectedOutcome === null || !amount || parseFloat(amount) <= 0) return;
    if (!publicKey) {
      toastError("Please connect your wallet to bet");
      return;
    }
    setIsConfirmModalOpen(true);
  }


  function handleConfirmBet() {
    if (selectedOutcome === null || !amount || !publicKey) return;
    betMutation.mutate({
      marketId: market.id,
      outcomeIndex: selectedOutcome,
      amount: parseFloat(amount),
      walletAddress: publicKey,
    });
  }

  const isExpired = new Date(market.end_date) <= new Date();
  const canBet = !market.resolved && !isExpired && publicKey;
  const isPending = betMutation.isPending;

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-4">
      <h3 className="text-white font-semibold text-lg">Place Your Bet</h3>

      {/* Odds Display */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSelectedOutcome(0)}
          disabled={!canBet || isPending}
          className={`relative p-4 rounded-xl transition-all btn-press-scale ${
            selectedOutcome === 0
              ? "bg-green-600 ring-2 ring-green-400 shadow-lg shadow-green-900/30"
              : "bg-gray-800 hover:bg-gray-700"
          } ${!canBet || isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >

          <div className="text-gray-400 text-xs mb-1">YES</div>
          <div className="text-white text-2xl font-bold flex justify-center">
            <OddsTicker value={odds.yes * 100} size="lg" />
          </div>
          <div className="text-gray-400 text-xs mt-1">${(1 / odds.yes).toFixed(2)}</div>
          {selectedOutcome === 0 && (
            <div className="absolute top-2 right-2 w-3 h-3 bg-green-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setSelectedOutcome(1)}
          disabled={!canBet || isPending}
          className={`relative p-4 rounded-xl transition-all btn-press-scale ${
            selectedOutcome === 1
              ? "bg-red-600 ring-2 ring-red-400 shadow-lg shadow-red-900/30"
              : "bg-gray-800 hover:bg-gray-700"
          } ${!canBet || isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >

          <div className="text-gray-400 text-xs mb-1">NO</div>
          <div className="text-white text-2xl font-bold flex justify-center">
            <OddsTicker value={odds.no * 100} size="lg" />
          </div>
          <div className="text-gray-400 text-xs mt-1">${(1 / odds.no).toFixed(2)}</div>
          {selectedOutcome === 1 && (
            <div className="absolute top-2 right-2 w-3 h-3 bg-red-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <label className="text-gray-400 text-sm">Amount to stake</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!canBet || isPending}
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 text-lg outline-none border border-gray-700 focus:border-blue-500 disabled:opacity-50"
            min="0"
            step="0.01"
          />
          <span className="flex items-center px-3 text-gray-400 font-medium">XLM</span>
        </div>
        <StakePresets
          amount={amount}
          onSelect={setAmount}
          walletBalance={0} // Fixed missing variable
          disabled={!canBet}
        />


        {/* Potential Payout */}
        {selectedOutcome !== null && amount && parseFloat(amount) > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Potential payout:</span>
            <span className="text-green-400 font-semibold">
              {(parseFloat(amount) / (selectedOutcome === 0 ? odds.yes : odds.no)).toFixed(2)} XLM
            </span>
          </div>
        )}
      </div>

      {/* Action Button */}
      {publicKey ? (
        <button
          onClick={handleBet}
          disabled={!canBet || selectedOutcome === null || !amount || isPending}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-all btn-press-scale shadow-xl shadow-blue-900/20"
        >

          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirming...
            </span>
          ) : (
            "Place Bet"
          )}
        </button>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition-all btn-press-scale shadow-xl shadow-blue-900/20"
        >

          {connecting ? "Connecting..." : "Connect Wallet to Bet"}
        </button>
      )}

      <div className="md:hidden pt-4">
        {/* Mobile Spacer */}
      </div>


      {selectedOutcome !== null && (
        <BetConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={handleConfirmBet}
          isLoading={betMutation.isPending}
          error={betMutation.error ? (betMutation.error as Error).message : null}
          market={market}
          outcomeIndex={selectedOutcome}
          amount={parseFloat(amount) || 0}
          odds={selectedOutcome === 0 ? odds.yes : odds.no}
        />
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type TabType = "about" | "positions" | "activity";

interface MarketDetailPageProps {
  marketId: string;
}

export default function MarketDetailPage({ marketId }: MarketDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>("about");
  const { publicKey, disconnect } = useWallet();

  // Fetch market detail via shared hook
  const { data: marketData, isLoading: marketLoading, error: marketError } = useMarket(marketId);

  // Fetch pool size from reserves (for on-chain balance)
  const { data: poolData } = useQuery<{ pool_size: string }>({
    queryKey: ["poolSize", marketData?.market.id],
    queryFn: () => fetchPoolSize(marketData!.market.id),
    enabled: !!marketData?.market.id,
    refetchInterval: 30000,
  });

  const market = marketData?.market ?? DEMO_MARKET;
  const bets = marketData?.bets ?? DEMO_BETS;
  const positions = calculatePositions(bets);
  const odds = {
    yes: calculateOdds(bets, 0),
    no: calculateOdds(bets, 1),
  };

  function handleBetPlaced() {}

  const tabs: { id: TabType; label: string }[] = [
    { id: "about", label: "About" },
    { id: "positions", label: "Positions" },
    { id: "activity", label: "Activity" },
  ];

  const pageContent = (
    <main className="min-h-screen bg-gray-950 text-white pb-32">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <span>←</span>
              <span className="text-sm">Back</span>
            </Link>
            <div className="flex items-center gap-3">
              {publicKey ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 hidden sm:inline">
                    {formatWallet(publicKey)}
                  </span>
                  <button
                    onClick={disconnect}
                    className="text-xs border border-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-400"
                  >
                    Disconnect
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Error State */}
        {marketError && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-6">
            <p className="text-red-400">Failed to load market: {marketError.message}</p>
          </div>
        )}

        {/* Loading State */}
        {marketLoading ? (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-3/4 mb-4" />
              <div className="h-4 bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        ) : (
          <>
            {/* Market Title & Status */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                {market.resolved ? (
                  <span className="bg-green-800 text-green-300 px-2 py-1 rounded-full text-xs font-medium">
                    Resolved
                  </span>
                ) : new Date(market.end_date) <= new Date() ? (
                  <span className="bg-yellow-800 text-yellow-300 px-2 py-1 rounded-full text-xs font-medium">
                    Ended
                  </span>
                ) : (
                  <span className="bg-blue-800 text-blue-300 px-2 py-1 rounded-full text-xs font-medium animate-pulse">
                    Live
                  </span>
                )}
                <span className="text-gray-500 text-sm">
                  Ends {new Date(market.end_date).toLocaleDateString()}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                {market.question}
              </h1>
            </div>

            {/* Pool Size Banner */}
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl p-4 mb-6 border border-blue-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-300 text-sm">Current Pool Size</p>
                  <p className="text-white text-2xl font-bold">
                    {parseFloat(poolData?.pool_size ?? market.total_pool).toFixed(2)} XLM
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-blue-300 text-sm">Live Odds</p>
                  <p className="text-white font-semibold flex items-center justify-end gap-1">
                    <OddsTicker value={odds.yes * 100} size="sm" className="text-green-400" />
                    <span className="text-gray-500">/</span>
                    <OddsTicker value={odds.no * 100} size="sm" className="text-red-400" />
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-800 mb-6 -mx-4 px-4">
              <div className="flex">
                {tabs.map((tab) => (
                  <Tab
                    key={tab.id}
                    active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    label={tab.label}
                  />
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === "about" && (
              <AboutTab market={market} poolSize={poolData?.pool_size ?? market.total_pool} />
            )}
            {activeTab === "positions" && (
              <PositionsTab positions={positions} outcomes={market.outcomes} />
            )}
            {activeTab === "activity" && <ActivityTab bets={bets} outcomes={market.outcomes} />}

            {/* Mobile Sticky Betting Panel */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4 md:static md:mt-6 md:bg-transparent md:border-0 md:p-0 z-20">
              <div className="max-w-4xl mx-auto">
                <BettingPanel market={market} odds={odds} onBetPlaced={handleBetPlaced} />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:block">{pageContent}</div>

      {/* Mobile layout */}
      <div className="block md:hidden">
        <MobileShell activeMarket={market} walletAddress={publicKey} onBetPlaced={handleBetPlaced}>
          {pageContent}
        </MobileShell>
      </div>
    </>
  );
}
