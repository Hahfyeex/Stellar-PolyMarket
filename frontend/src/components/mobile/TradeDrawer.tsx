"use client";
import { useEffect, useRef, useState } from "react";
import type { Market } from "../../types/market";
import ResolutionCenter from "../ResolutionCenter";
import { trackEvent } from "../../lib/firebase";
import WhatIfSimulator from "../WhatIfSimulator";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import StakePresets from "../StakePresets";
import SlippageSettings from "../SlippageSettings";
import SlippageWarningModal from "../SlippageWarningModal";
import { useSlippageCheck } from "../../hooks/useSlippageCheck";
import { toStroops, calcPayoutStroops, stroopsToXlm } from "../../utils/slippageCalc";

interface Props {
  market: Market | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string | null;
  walletBalance?: number;
  onBetPlaced?: () => void;
}

const CLOSE_THRESHOLD_PX = 100; // Swipe-to-dismiss threshold in pixels

export default function TradeDrawer({
  market,
  open,
  onClose,
  walletAddress,
  walletBalance = 0,
  onBetPlaced,
}: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusSentinelStartRef = useRef<HTMLDivElement>(null);
  const focusSentinelEndRef = useRef<HTMLDivElement>(null);

  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);

  // Use persistence hook — falls back to marketId=0 when no market selected
  const {
    outcomeIndex: selectedOutcome,
    amount,
    slippageTolerance,
    setOutcomeIndex: setSelectedOutcome,
    setAmount,
    setSlippageTolerance,
    clearForm,
  } = useFormPersistence(market?.id ?? 0);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const isExpired = market ? new Date(market.end_date) <= new Date() : false;

  const { checkSlippage, slippageState, dismiss, checking } = useSlippageCheck();

  /**
   * Focus trap: enable focus cycling within drawer when open
   */
  useEffect(() => {
    if (!open) return;

    // Store the element that had focus before drawer opened
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Set initial focus to first focusable element in drawer
    const focusableElements = drawerRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusableEls = Array.from(
        drawerRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || []
      );

      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0] as HTMLElement;
      const lastEl = focusableEls[focusableEls.length - 1] as HTMLElement;
      const currentEl = document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: move backward
        if (currentEl === firstEl) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab: move forward
        if (currentEl === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  /**
   * On drawer close: restore focus to trigger button
   */
  useEffect(() => {
    if (open) return;

    // Delay restoration to allow animation to complete
    const timer = setTimeout(() => {
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        previousFocusRef.current.focus();
      } else if (triggerButtonRef.current) {
        triggerButtonRef.current.focus();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open]);

  /**
   * Compute the expected payout in XLM using BigInt stroop arithmetic.
   */
  function computeExpectedPayout(): number {
    if (!market || selectedOutcome === null) return 0;
    const stakeXlm = parseFloat(amount) || 0;
    const totalPool = parseFloat(market.total_pool) || 0;
    const outcomePool = totalPool / market.outcomes.length;
    const payout = calcPayoutStroops(
      toStroops(stakeXlm),
      toStroops(outcomePool),
      toStroops(totalPool)
    );
    return stroopsToXlm(payout);
  }

  /** Submit the bet to the API — called after slippage check passes */
  async function submitBet() {
    if (selectedOutcome === null || !amount || !walletAddress || !market) return;
    const xlm = parseFloat(amount);
    if (!isFinite(xlm) || xlm <= 0) {
      setMessage("Error: Enter a valid positive amount");
      return;
    }
    const stroops = Math.round(xlm * 1e7);
    if (!Number.isInteger(stroops) || stroops <= 0) {
      setMessage("Error: Amount too small");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          outcomeIndex: selectedOutcome,
          amount: stroops.toString(),
          walletAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Bet placed successfully!");
      trackEvent("bet_placed", {
        market_id: market.id,
        outcome_index: selectedOutcome,
        amount: stroops,
        outcome_name: market.outcomes[selectedOutcome],
      });
      clearForm();
      onBetPlaced?.();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
      trackEvent("bet_error", {
        market_id: market?.id,
        error_message: err.message.substring(0, 100),
        amount: stroops,
      });
    } finally {
      setLoading(false);
    }
  }

  // Reset drag when drawer opens/closes
  useEffect(() => {
    if (!open) setDragY(0);

    if (open && market) {
      trackEvent("begin_checkout", {
        market_id: market.id,
        market_question: market.question.substring(0, 50),
        total_pool: parseFloat(market.total_pool),
        outcomes_count: market.outcomes.length,
        market_resolved: market.resolved,
      });
    }
  }, [open, market?.id]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only allow downward drag
    if (delta > 0) setDragY(delta);
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    setIsDragging(false);
    // Close if dragged more than CLOSE_THRESHOLD_PX
    if (dragY > CLOSE_THRESHOLD_PX) {
      onClose();
      setDragY(0);
    } else {
      // Spring back animation
      setDragY(0);
    }
  }

  /** Entry point — triggers slippage check before submitting */
  async function placeBet() {
    if (selectedOutcome === null || !amount || !walletAddress || !market) return;
    const xlm = parseFloat(amount);
    if (!isFinite(xlm) || xlm <= 0) {
      setMessage("Error: Enter a valid positive amount");
      return;
    }

    // Check slippage before proceeding
    const expectedPayout = computeExpectedPayout();
    await checkSlippage({
      amount: xlm,
      expectedPayout,
      tolerancePct: slippageTolerance,
      onApprove: submitBet,
    });
  }

  if (!open && dragY === 0) return null;

  return (
    <>
      {/* Slippage warning modal */}
      {slippageState?.exceeded && (
        <SlippageWarningModal
          expectedPayout={slippageState.expectedPayout}
          currentPayout={slippageState.currentPayout}
          tolerancePct={slippageState.tolerancePct}
          onProceed={async () => {
            dismiss();
            await submitBet();
          }}
          onCancel={dismiss}
        />
      )}

      {/* Backdrop */}
      <div
        data-testid="trade-drawer-backdrop"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Focus trap sentinel - start */}
      <div ref={focusSentinelStartRef} tabIndex={0} aria-hidden="true" />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        data-testid="trade-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-drawer-title"
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl max-h-[80vh] flex flex-col"
        data-safe-area="bottom"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease-out",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Drag handle */}
        <div
          data-testid="trade-drawer-handle"
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="button"
          aria-label="Drag to close trade drawer"
          tabIndex={0}
        >
          <div className="w-8 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {market ? (
            <>
              <h2 id="trade-drawer-title" className="text-white font-semibold text-lg leading-snug mb-4">
                {market.question}
              </h2>

              <p className="text-gray-400 text-sm mb-4">
                Pool:{" "}
                <span className="text-white font-medium">
                  {parseFloat(market.total_pool).toFixed(2)} XLM
                </span>
              </p>

              {/* Outcome buttons */}
              <div className="flex gap-3 mb-5" role="group" aria-label="Select outcome">
                {market.outcomes.map((outcome, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedOutcome(i)}
                    disabled={market.resolved || isExpired}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors
                      ${
                        market.resolved && market.winning_outcome === i
                          ? "bg-green-600 text-white"
                          : selectedOutcome === i
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                  >
                    {outcome}
                  </button>
                ))}
              </div>

              {/* Bet form */}
              {walletAddress && !market.resolved && !isExpired ? (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <label htmlFor="trade-drawer-amount" className="sr-only">
                      Stake amount in XLM
                    </label>
                    <input
                      id="trade-drawer-amount"
                      type="number"
                      placeholder="Amount (XLM)"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={loading || checking}
                      className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500 disabled:opacity-50"
                      aria-label="Stake amount in XLM"
                    />
                    <button
                      onClick={placeBet}
                      disabled={loading || checking || selectedOutcome === null || !amount}
                      aria-label="Place bet"
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-xl text-sm font-bold text-white transition-colors"
                    >
                      {loading || checking ? "..." : "Bet"}
                    </button>
                  </div>

                  {/* Stake presets */}
                  <StakePresets
                    amount={amount}
                    onSelect={setAmount}
                    walletBalance={walletBalance}
                    disabled={loading || checking}
                  />

                  {/* Slippage + clear row */}
                  <div className="flex items-center justify-between">
                    <SlippageSettings value={slippageTolerance} onChange={setSlippageTolerance} />
                    <button
                      data-testid="clear-form"
                      onClick={() => {
                        clearForm();
                        setMessage("");
                      }}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Clear form
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-2">
                  {walletAddress
                    ? "Betting is closed for this market"
                    : "Connect your wallet to place a bet"}
                </p>
              )}

              {/* Status message */}
              {message && (
                <p
                  data-testid="trade-drawer-message"
                  className={`text-sm mt-3 ${
                    message.startsWith("Error") ? "text-red-400" : "text-green-400"
                  }`}
                  role={message.startsWith("Error") ? "alert" : "status"}
                >
                  {message}
                </p>
              )}

              <div className="mt-5">
                <ResolutionCenter market={market} />
              </div>

              {/* What-If Simulator */}
              {selectedOutcome !== null && (
                <WhatIfSimulator
                  poolForOutcome={parseFloat(market.total_pool) / market.outcomes.length}
                  totalPool={parseFloat(market.total_pool)}
                />
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No market selected</p>
          )}
        </div>
      </div>

      {/* Focus trap sentinel - end */}
      <div ref={focusSentinelEndRef} tabIndex={0} aria-hidden="true" />
    </>
  );
}
