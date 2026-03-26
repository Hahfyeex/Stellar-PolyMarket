"use client";
import { useState, useEffect } from "react";
import { useWallet } from "../hooks/useWallet";
import MarketCard from "./MarketCard";

interface Props {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const { publicKey, connect, connecting } = useWallet();

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem("onboardingComplete", "true");
    onComplete();
  };

  const steps = [
    {
      title: "Connect Your Wallet",
      description: "To start predicting, you need a Stellar wallet. We recommend Freighter.",
      content: (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="bg-blue-500/10 p-6 rounded-full">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-16 h-16 text-blue-500">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M12 11V11.01M16 11V11.01M2 10H22M8 11V11.01"/>
            </svg>
          </div>
          {publicKey ? (
            <div className="text-center">
              <p className="text-green-400 font-medium mb-2">Wallet Connected!</p>
              <p className="text-sm text-gray-400">{publicKey.slice(0, 10)}...{publicKey.slice(-8)}</p>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105"
            >
              {connecting ? "Connecting..." : "Connect Freighter"}
            </button>
          )}
        </div>
      ),
    },
    {
      title: "How Markets Work",
      description: "Prediction markets allow you to trade on the outcome of future events.",
      content: (
        <div className="py-6">
          <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center font-bold">Q</div>
                <span className="text-xs text-gray-400 text-center">Event<br/>Question</span>
              </div>
              <div className="h-0.5 flex-1 bg-gray-700 mx-4 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 px-2 text-[10px] text-gray-500">Predict</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center font-bold">A</div>
                <span className="text-xs text-gray-400 text-center">Chosen<br/>Outcome</span>
              </div>
              <div className="h-0.5 flex-1 bg-gray-700 mx-4 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 px-2 text-[10px] text-gray-500">Result</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center font-bold">$$</div>
                <span className="text-xs text-gray-400 text-center">Earn<br/>XLM</span>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              When you're right, you earn a share of the total pool proportional to your bet. Markets are powered by Stellar's lightning-fast network.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Place Your Bet",
      description: "Select an outcome, enter the amount of XLM you want to stake, and confirm.",
      content: (
        <div className="py-2 transform scale-90 md:scale-100">
          <MarketCard
            market={{
              id: 0,
              question: "Will the next Stellar upgrade be successful?",
              end_date: "2026-12-31T00:00:00Z",
              outcomes: ["Yes", "No"],
              resolved: false,
              winning_outcome: null,
              total_pool: "5000",
            }}
            walletAddress={null}
            isPreview={true}
          />
          <p className="text-xs text-center text-gray-500 mt-4 italic">
            * This is a demo card. Real bets require a connected wallet.
          </p>
        </div>
      ),
    },
    {
      title: "Calculate Your Payout",
      description: "Your potential winnings depend on the total pool and the odds.",
      content: (
        <div className="py-6">
          <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Your Bet</span>
              <span className="text-white font-mono">100 XLM</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Total Pool</span>
              <span className="text-white font-mono">1,000 XLM</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Total Bets on "Yes"</span>
              <span className="text-white font-mono">400 XLM</span>
            </div>
            <div className="h-px bg-gray-700 my-2"></div>
            <div className="flex justify-between items-center">
              <span className="text-blue-400 font-semibold">Potential Payout</span>
              <span className="text-blue-400 font-bold text-lg font-mono">250 XLM</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Formula: (Your Bet / Total Bets on Winning Outcome) × Total Pool
              <br/>
              (100 / 400) × 1,000 = 250 XLM
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gray-900 w-full max-w-lg border border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Progress Stepper */}
        <div className="flex gap-2 p-6 pb-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= currentStep ? "bg-blue-600" : "bg-gray-800"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-8 pt-4 flex-1">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
            {steps[currentStep].title}
          </h2>
          <p className="text-gray-400 mb-6">
            {steps[currentStep].description}
          </p>
          {steps[currentStep].content}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex items-center justify-between gap-4">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-white text-sm font-medium transition-colors"
          >
            Skip to Dashboard
          </button>
          
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="px-5 py-2.5 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors text-sm font-semibold"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all text-sm font-bold shadow-lg shadow-blue-900/20"
            >
              {currentStep === 3 ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
