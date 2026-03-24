"use client";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
}

interface Props {
  activeMarket: Market | null;
  drawerOpen: boolean;
  onPress: () => void;
}

export default function FloatingBetButton({ activeMarket, drawerOpen, onPress }: Props) {
  const isDisabled = activeMarket === null;

  return (
    <button
      data-testid="floating-bet-button"
      onClick={onPress}
      disabled={isDisabled}
      aria-label="Place a bet"
      className={`fixed z-40 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full
        bg-blue-600 shadow-lg shadow-blue-900/50 flex items-center justify-center
        transition-all duration-200
        ${isDisabled ? "opacity-40 pointer-events-none" : "hover:bg-blue-500 active:scale-95"}
        ${drawerOpen ? "opacity-0 pointer-events-none" : ""}
      `}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
    >
      {/* Lightning bolt icon */}
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
      </svg>
    </button>
  );
}
