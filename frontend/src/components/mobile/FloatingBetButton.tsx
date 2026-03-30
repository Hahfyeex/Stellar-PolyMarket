"use client";
import { useOddsStream } from "../../hooks/useOddsStream";
import type { Market } from "../../types/market";

interface Props {
  activeMarket: Market | null;
  drawerOpen: boolean;
  onPress: () => void;
}

export default function FloatingBetButton({ activeMarket, drawerOpen, onPress }: Props) {
  const marketId = activeMarket?.id ?? 0;
  const { odds: liveOdds } = useOddsStream(marketId);

  // Disable if no market, resolved, or expired
  const isExpired = activeMarket ? new Date(activeMarket.end_date) <= new Date() : false;
  const isDisabled = activeMarket === null || activeMarket.resolved || isExpired;

  // Calculate YES odds (assume index 0 is YES)
  const defaultOdds = activeMarket ? 100 / activeMarket.outcomes.length : 0;
  const yesOdds = liveOdds[0] ?? defaultOdds;
  const displayOdds = Math.round(yesOdds);

  if (!activeMarket) return null;

  return (
    <button
      data-testid="floating-bet-button"
      onClick={onPress}
      disabled={isDisabled}
      aria-label="Place a bet"
      className={`fixed z-40 right-6 md:hidden flex items-center gap-2 px-5 h-14 
        rounded-full bg-blue-600 shadow-xl shadow-blue-900/40 text-white font-bold
        transition-all duration-300 transform-gpu
        ${isDisabled ? "opacity-0 pointer-events-none scale-90" : "hover:bg-blue-500 active:scale-95 animate-floating-in"}
        ${drawerOpen ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}
      `}
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 84px)",
      }}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="text-[10px] opacity-80 mb-0.5 uppercase tracking-wider">Yes</span>
        <span className="text-lg">{displayOdds}%</span>
      </div>

      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center ml-1">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
        </svg>
      </div>
    </button>
  );
}
