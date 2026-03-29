"use client";
/**
 * OnboardingWizard
 *
 * 4-step modal wizard shown to first-time users.
 * Renders as a full-screen overlay with a centered card.
 *
 * Steps:
 *   0 — Wallet Connect   (connect Freighter)
 *   1 — How Markets Work (static explainer)
 *   2 — Place a Bet      (demo MarketCard, disabled)
 *   3 — Payouts          (example payout calculation)
 *
 * Navigation:
 *   Next / Back buttons + progress stepper at top.
 *   Skip button dismisses from any step and marks complete.
 */
import { useWalletContext } from "../../context/WalletContext";
import { useOnboarding, TOTAL_STEPS } from "../../hooks/useOnboarding";
import StepWallet from "./StepWallet";
import StepMarkets from "./StepMarkets";
import StepBetting from "./StepBetting";
import StepPayouts from "./StepPayouts";

const STEP_LABELS = ["Wallet", "Markets", "Betting", "Payouts"];

export default function OnboardingWizard() {
  const { publicKey, isLoading, connect } = useWalletContext();
  const { showWizard, currentStep, nextStep, prevStep, skip, complete } = useOnboarding();

  if (!showWizard) return null;

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  const steps = [
    <StepWallet key="wallet" publicKey={publicKey} isLoading={isLoading} onConnect={connect} />,
    <StepMarkets key="markets" />,
    <StepBetting key="betting" />,
    <StepPayouts key="payouts" />,
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Stella Polymarket"
      data-testid="onboarding-wizard"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className="text-white font-bold text-sm">Stella Polymarket</span>
          </div>
          <button
            onClick={skip}
            data-testid="skip-button"
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Skip →
          </button>
        </div>

        {/* ── Progress stepper ───────────────────────────────────────────── */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-1" role="list" aria-label="Onboarding steps">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center flex-1" role="listitem">
                {/* Step dot */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div
                    data-testid={`step-dot-${i}`}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      i < currentStep
                        ? "bg-blue-600 text-white"
                        : i === currentStep
                        ? "bg-blue-500 text-white ring-2 ring-blue-400/40"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {i < currentStep ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-xs hidden sm:block ${i === currentStep ? "text-blue-400" : "text-gray-600"}`}>
                    {label}
                  </span>
                </div>
                {/* Connector line */}
                {i < TOTAL_STEPS - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${i < currentStep ? "bg-blue-600" : "bg-gray-800"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step content ───────────────────────────────────────────────── */}
        <div className="px-6 py-5 flex-1 min-h-[320px]" data-testid="step-content">
          {steps[currentStep]}
        </div>

        {/* ── Footer navigation ──────────────────────────────────────────── */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3 border-t border-gray-800 pt-4">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            data-testid="prev-button"
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Back
          </button>

          <span className="text-xs text-gray-600">
            {currentStep + 1} / {TOTAL_STEPS}
          </span>

          {isLastStep ? (
            <button
              onClick={complete}
              data-testid="finish-button"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-semibold transition-colors"
            >
              Get Started →
            </button>
          ) : (
            <button
              onClick={nextStep}
              data-testid="next-button"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-semibold transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
