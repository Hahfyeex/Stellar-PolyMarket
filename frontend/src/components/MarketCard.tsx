import { useEffect, useState } from "react";
import { useRouter } from "next/router"; // or "next/navigation" if using App Router
import type { Market } from "../types/market";
import Link from "next/link";
import { useToast } from "./ToastProvider";
import PoolOwnershipChart from "./PoolOwnershipChart";
import PayoutTooltip from "./PayoutTooltip";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { useSlippageGuard } from "../hooks/useSlippageGuard";
import { useTrustline } from "../hooks/useTrustline";
import { trackEvent } from "../lib/firebase";
import ResolutionCenter from "./ResolutionCenter";
import SlippageSettings from "./SlippageSettings";
import SlippageWarningModal from "./SlippageWarningModal";
import Toast from "./Toast";
import TrustlineModal from "./TrustlineModal";
import WhatIfSimulator from "./WhatIfSimulator";
import { useOptimisticBet } from "../hooks/useOptimisticBet";
import OptimisticBetIndicator from "./OptimisticBetIndicator";
import OddsTicker from "./OddsTicker";
import { useVolatilityPulse } from "../hooks/useVolatilityPulse";
import { useOddsStream } from "../hooks/useOddsStream";

interface Props {
  market: Market;
  walletAddress: string | null;
  onBetPlaced?: () => void;
  showFullCard?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export default function MarketCard({
  market,
  walletAddress,
  onBetPlaced,
  isError = false,
  onRetry,
}: Props) {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

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
  const [slippageWarning, setSlippageWarning] = useState<{
    expectedPayout: number;
    currentPayout: number;
  } | null>(null);

  const {
    state: trustlineState,
    pendingAsset,
    errorMessage: trustlineError,
    checkAndRun,
    confirmTrustline,
    dismiss: dismissTrustline,
    retry: retryTrustline,
  } = useTrustline();

  const { snapshotOdds, checkSlippage } = useSlippageGuard();
  const { submitBet: submitOptimisticBet, betsForMarket } = useOptimisticBet();

  const pendingBets = betsForMarket(market.id);
  const isExpired = new Date(market.end_date) <= new Date();

  const totalPool = parseFloat(market.total_pool);
  const outcomePool = totalPool / market.outcomes.length;
  const numericAmount = parseFloat(amount) || 0;

  const defaultOdds = 100 / market.outcomes.length;

  const { odds: liveOdds, connected: oddsConnected, changedIndices } = useOddsStream(market.id);

  const tickerOdds = liveOdds[0] ?? defaultOdds;
  const { isPulsing, direction } = useVolatilityPulse(tickerOdds);

  useEffect(() => {
    if (selectedOutcome !== null && numericAmount) {
      snapshotOdds(numericAmount, outcomePool, totalPool);
    }
  }, [selectedOutcome, numericAmount, outcomePool, totalPool, snapshotOdds]);

  const handleShareMarket = async () => {
    const shareData = {
      title: market.question,
      text: `Check out this prediction market: ${market.question}\nPool: ${totalPool.toFixed(
        2
      )} XLM`,
      url: `${window.location.origin}?market=${market.id}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent("share_market", {
          market_id: market.id,
          share_method: "native_share_api",
        });
      } else {
        await navigator.clipboard.writeText(
          `${shareData.title}\n${shareData.text}\n${shareData.url}`
        );
        trackEvent("share_market", {
          market_id: market.id,
          share_method: "clipboard",
        });
        setMessage("Market link copied to clipboard!");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      trackEvent("share_error", {
        market_id: market.id,
        error_message: err instanceof Error ? err.message.substring(0, 100) : "Unknown error",
      });
    }
  };

  async function submitBet() {
    if (selectedOutcome === null || !numericAmount || !walletAddress) return;

    setLoading(true);
    setMessage("");

    const success = await submitOptimisticBet(
      {
        marketId: market.id,
        marketTitle: market.question,
        outcomeIndex: selectedOutcome,
        outcomeName: market.outcomes[selectedOutcome],
        amount: numericAmount,
        walletAddress,
      },
      (reason) => toastError(`Bet failed: ${reason}`)
    );

    setLoading(false);

    if (success) {
      toastSuccess("Bet placed successfully!");
      clearForm();
      onBetPlaced?.();
    }
  }

  async function placeBet() {
    if (selectedOutcome === null || !numericAmount || !walletAddress) return;

    const check = checkSlippage(numericAmount, outcomePool, totalPool, slippageTolerance);

    if (check.exceeded) {
      setSlippageWarning({
        expectedPayout: check.expectedPayout,
        currentPayout: check.currentPayout,
      });
      return;
    }

    if (market.asset) {
      await checkAndRun(market.asset, walletAddress, submitBet);
    } else {
      await submitBet();
    }
  }

  const proceedAfterSlippageWarning = async () => {
    if (!walletAddress) return;

    if (market.asset) {
      await checkAndRun(market.asset, walletAddress, submitBet);
    } else {
      await submitBet();
    }
  };

  if (isError) {
    return (
      <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-red-800 items-center justify-center min-h-[200px]">
        <p className="text-red-400 text-sm font-medium">Failed to load market</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-4 border border-gray-800">
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
            await proceedAfterSlippageWarning();
          }}
          onCancel={() => setSlippageWarning(null)}
        />
      )}

      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-white text-lg flex-1">{market.question}</h3>

        <button
          onClick={handleShareMarket}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700"
        >
          Share
        </button>
      </div>

      <p className="text-gray-400 text-sm">
        Pool: <span className="text-white font-medium">{totalPool.toFixed(2)} XLM</span> · Ends:{" "}
        {new Date(market.end_date).toLocaleDateString()}
      </p>

      <Link
        href={`/market/${market.id}`}
        className="text-blue-400 hover:text-blue-300 text-sm font-medium"
      >
        View Details →
      </Link>

      <PoolOwnershipChart marketId={market.id} />

      {oddsConnected && (
        <span className="text-xs text-green-400 flex items-center gap-1">● Live</span>
      )}

      <div className="flex gap-2 flex-wrap">
        {market.outcomes.map((outcome, i) => {
          const outcomeOdds = liveOdds[i] ?? defaultOdds;
          const isFlashing = changedIndices.has(i);

          return (
            <button
              key={i}
              onClick={() => setSelectedOutcome(i)}
              disabled={market.resolved || isExpired}
              className={`px-4 py-2 rounded-lg text-sm ${isFlashing ? "flash-update" : ""} ${
                selectedOutcome === i ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"
              }`}
            >
              {outcome}
              <OddsTicker value={outcomeOdds} size="sm" />
            </button>
          );
        })}
      </div>

      {!market.resolved && !isExpired && walletAddress && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount (XLM)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 flex-1"
            />
            <button
              onClick={placeBet}
              disabled={loading || selectedOutcome === null || !numericAmount}
              className="bg-blue-600 px-4 py-2 rounded-lg text-sm"
            >
              {loading ? "Placing..." : "Bet"}
            </button>
          </div>

          <SlippageSettings value={slippageTolerance} onChange={setSlippageTolerance} />

          <PayoutTooltip
            contractId={process.env.NEXT_PUBLIC_CONTRACT_ID ?? null}
            walletAddress={walletAddress}
            marketId={market.id}
            outcomeIndex={selectedOutcome}
            stakeAmount={numericAmount}
            poolForOutcome={outcomePool}
            totalPool={totalPool}
          />
        </div>
      )}

      {message && <p className="text-sm text-green-400">{message}</p>}

      <OptimisticBetIndicator bets={pendingBets} />

      {!market.resolved && !isExpired && selectedOutcome !== null && (
        <WhatIfSimulator poolForOutcome={outcomePool} totalPool={totalPool} />
      )}

      <ResolutionCenter />
    </div>
  );
}
