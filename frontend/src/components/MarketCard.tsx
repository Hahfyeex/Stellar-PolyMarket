import { useState, useEffect } from "react";
import type { Market } from "../types/market";
import Link from "next/link";
import { trackEvent } from "../lib/firebase";
import WhatIfSimulator from "./WhatIfSimulator";
import { useBettingSlip } from "../context/BettingSlipContext";
import Toast from "./Toast";
import PoolOwnershipChart from "./PoolOwnershipChart";
import PayoutTooltip from "./PayoutTooltip";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { useTrustline } from "../hooks/useTrustline";
import TrustlineModal from "./TrustlineModal";
import SlippageSettings from "./SlippageSettings";
import SlippageWarningModal from "./SlippageWarningModal";
import { useSlippageGuard } from "../hooks/useSlippageGuard";
import { useOptimisticBet } from "../hooks/useOptimisticBet";
import OptimisticBetIndicator from "./OptimisticBetIndicator";
import OddsTicker from "./OddsTicker";
import ResolutionCenter from "./ResolutionCenter";

interface Props {
  market: Market;
  walletAddress: string | null;
  onBetPlaced?: () => void;
  showFullCard?: boolean;
}

export default function MarketCard({ market, walletAddress, onBetPlaced }: Props) {
  const {
    outcomeIndex: selectedOutcome,
    amount,
    slippageTolerance,
    setOutcomeIndex: setSelectedOutcome,
    setAmount,
    setSlippageTolerance,
    clearForm,
  } = useFormPersistence(market.id);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showQueueFullToast, setShowQueueFullToast] = useState(false);
  const [slippageWarning, setSlippageWarning] = useState<{
    expectedPayout: number;
    currentPayout: number;
  } | null>(null);

  const { addBet } = useBettingSlip();
  const { state: trustlineState, pendingAsset, errorMessage: trustlineError,
          checkAndRun, confirmTrustline, dismiss: dismissTrustline, retry: retryTrustline } = useTrustline();
  const { snapshotOdds, checkSlippage } = useSlippageGuard();
  const { submitBet: submitOptimisticBet, betsForMarket } = useOptimisticBet();
  const pendingBets = betsForMarket(market.id);
  const isExpired = new Date(market.end_date) <= new Date();
  const totalPool = parseFloat(market.total_pool);
  const outcomePool = totalPool / market.outcomes.length;
  
  // Default odds for display in the ticker (until real per-outcome pool data is available)
  const defaultOdds = 100 / market.outcomes.length;

  // Snapshot odds whenever the user selects an outcome or changes amount
  useEffect(() => {
    if (selectedOutcome !== null && amount) {
      snapshotOdds(parseFloat(amount) || 0, outcomePool, totalPool);
    }
  }, [selectedOutcome, amount, outcomePool, totalPool, snapshotOdds]);

  const handleShareMarket = async () => {
    const shareData = {
      title: market.question,
      text: `Check out this prediction market: ${market.question}\nPool: ${totalPool.toFixed(2)} XLM`,
      url: `${window.location.origin}?market=${market.id}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent('share_market', { market_id: market.id, share_method: 'native' });
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
        setMessage("Market link copied!");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  async function submitBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;
    setLoading(true);
    setMessage("");

    const success = await submitOptimisticBet(
      {
        marketId: market.id,
        marketTitle: market.question,
        outcomeIndex: selectedOutcome,
        outcomeName: market.outcomes[selectedOutcome],
        amount: parseFloat(amount),
        walletAddress,
      },
      (reason) => setMessage(`Error: ${reason}`)
    );

    setLoading(false);
    if (success) {
      setMessage("Bet placed successfully!");
      clearForm();
      onBetPlaced?.();
    }
  }

  const handlePlaceBetAction = async () => {
    if (market.asset) {
      await checkAndRun(market.asset, walletAddress!, submitBet);
    } else {
      await submitBet();
    }
  };

  async function placeBet() {
    if (selectedOutcome === null || !amount || !walletAddress) return;

    const check = checkSlippage(parseFloat(amount), outcomePool, totalPool, slippageTolerance);
    
    if (check.exceeded) {
      setSlippageWarning({ expectedPayout: check.expectedPayout, currentPayout: check.currentPayout });
      return;
    }

    await handlePlaceBetAction();
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800">
      <TrustlineModal
        state={trustlineState}
        asset={pendingAsset}
        errorMessage={trustlineError}
        onConfirm={confirmTrustline}
        onDismiss={dismissTrustline}
        onRetry={retryTrustline}
      />

      {slippageWarning && (
        <SlippageWarningModal
          expectedPayout={slippageWarning.expectedPayout}
          currentPayout={slippageWarning.currentPayout}
          tolerancePct={slippageTolerance}
          onProceed={async () => {
            setSlippageWarning(null);
            await handlePlaceBetAction();
          }}
          onCancel={() => setSlippageWarning(null)}
        />
      )}
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-white text-lg leading-snug flex-1">{market.question}</h3>
        <div className="flex items-center gap-2">
          {market.resolved && (
            <span className="badge-fade-in inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-800 text-green-300">
              Resolved
            </span>
          )}
          <button onClick={handleShareMarket} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
              </svg>
          </button>
        </div>
      </div>

      <p className="text-gray-400 text-sm">
        Pool: <span className="text-white font-medium">{totalPool.toFixed(2)} XLM</span>
        &nbsp;·&nbsp;Ends: {new Date(market.end_date).toLocaleDateString()}
      </p>

      <Link href={`/market/${market.id}`} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
        View Details →
      </Link>

      <PoolOwnershipChart marketId={market.id} />

      <div className="flex gap-2 flex-wrap">
        {market.outcomes.map((outcome, i) => (
          <button
            key={i}
            onClick={() => setSelectedOutcome(i)}
            disabled={market.resolved || isExpired}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${selectedOutcome === i ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}
            `}
          >
            <span>{outcome}</span>
            <OddsTicker value={defaultOdds} size="sm" />
          </button>
        ))}
      </div>

      {!market.resolved && !isExpired && walletAddress && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount (XLM)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm flex-1 outline-none border border-gray-700"
            />
            <button
              onClick={placeBet}
              disabled={loading || selectedOutcome === null || !amount}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {loading ? "Placing..." : "Bet"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <SlippageSettings value={slippageTolerance} onChange={setSlippageTolerance} />
            <button onClick={() => { clearForm(); setMessage(""); }} className="text-xs text-gray-500 hover:text-red-400">
              Clear form
            </button>
          </div>

          <PayoutTooltip
            contractId={process.env.NEXT_PUBLIC_CONTRACT_ID ?? null}
            walletAddress={walletAddress}
            marketId={market.id}
            outcomeIndex={selectedOutcome}
            stakeAmount={parseFloat(amount) || 0}
            poolForOutcome={outcomePool}
            totalPool={totalPool}
          />
        </div>
      )}

      {message && <p className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{message}</p>}

      {/* Optimistic bet status indicators */}
      <OptimisticBetIndicator bets={pendingBets} />

      {/* Queue-full toast */}
      {showQueueFullToast && (
        <Toast message="Betting slip is full." type="warning" onDismiss={() => setShowQueueFullToast(false)} />
      )}

      {!market.resolved && !isExpired && selectedOutcome !== null && (
        <WhatIfSimulator poolForOutcome={outcomePool} totalPool={totalPool} />
      )}

      <ResolutionCenter market={market} compact />
    </div>
  );
}
