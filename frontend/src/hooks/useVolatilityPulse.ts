import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Volatility threshold: 5% change triggers pulse animation
 * Represents the minimum percentage change to trigger the pulse effect
 */
const VOLATILITY_THRESHOLD = 0.05;

/**
 * Time window for volatility detection: 60 seconds
 * Odds changes within this window are considered for pulse triggering
 */
const VOLATILITY_WINDOW_MS = 60_000;

interface VolatilityState {
  isPulsing: boolean;
  direction: "up" | "down" | null;
}

/**
 * useVolatilityPulse Hook
 *
 * Tracks odds changes and triggers a pulse animation when volatility exceeds threshold.
 * - Monitors odds value changes over a 60-second window
 * - Triggers pulse when change exceeds 5% (configurable via VOLATILITY_THRESHOLD)
 * - Direction: "up" for rising odds (green pulse), "down" for falling odds (red pulse)
 * - Animation runs exactly 3 cycles then stops
 * - Resets isPulsing after animation completes
 *
 * @param odds - Current odds value (0-100)
 * @returns Object with isPulsing state and direction indicator
 */
export function useVolatilityPulse(odds: number): VolatilityState {
  const prevOddsRef = useRef<number>(odds);
  const windowStartRef = useRef<number>(Date.now());
  const [isPulsing, setIsPulsing] = useState(false);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);

  // Detect volatility and trigger pulse
  useEffect(() => {
    const now = Date.now();
    const timeSinceWindowStart = now - windowStartRef.current;

    // Reset window if 60 seconds have passed
    if (timeSinceWindowStart > VOLATILITY_WINDOW_MS) {
      windowStartRef.current = now;
      prevOddsRef.current = odds;
      return;
    }

    const prevOdds = prevOddsRef.current;
    const oddsChange = Math.abs(odds - prevOdds);
    const percentageChange = prevOdds !== 0 ? oddsChange / prevOdds : 0;

    // Check if change exceeds volatility threshold
    if (percentageChange >= VOLATILITY_THRESHOLD) {
      const newDirection = odds > prevOdds ? "up" : "down";
      setDirection(newDirection);
      setIsPulsing(true);
      prevOddsRef.current = odds;
    }
  }, [odds]);

  // Handle animation end event
  const handleAnimationEnd = useCallback(() => {
    setIsPulsing(false);
    setDirection(null);
  }, []);

  return {
    isPulsing,
    direction: isPulsing ? direction : null,
  };
}

export { VOLATILITY_THRESHOLD, VOLATILITY_WINDOW_MS };
