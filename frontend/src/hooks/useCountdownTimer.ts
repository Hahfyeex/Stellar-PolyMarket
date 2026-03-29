/**
 * useCountdownTimer
 *
 * Countdown timer hook for displaying remaining time until a deadline.
 * Properly handles cleanup and re-renders only when time changes.
 *
 * @param endTime - ISO string or Date when countdown should reach zero
 * @param onComplete - Optional callback when countdown reaches zero
 * @returns { remaining: number (ms), formatted: string (e.g. "3m 42s"), isExpired: boolean }
 */
import { useState, useEffect, useCallback } from "react";

export interface CountdownResult {
  remaining: number; // milliseconds remaining
  formatted: string; // human-readable format (e.g. "3m 42s")
  isExpired: boolean; // true when remaining <= 0
}

export function useCountdownTimer(
  endTime: string | Date | null,
  onComplete?: () => void
): CountdownResult {
  const [remaining, setRemaining] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Format milliseconds to "Xm Ys" format
  const formatTime = useCallback((ms: number): string => {
    if (ms <= 0) return "0s";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, []);

  useEffect(() => {
    if (!endTime) {
      setRemaining(0);
      setIsExpired(true);
      return;
    }

    const endDate = new Date(endTime).getTime();

    // Calculate initial remaining time
    const calculateRemaining = () => {
      const now = Date.now();
      const diff = endDate - now;
      return Math.max(0, diff);
    };

    // Set initial state
    const initialRemaining = calculateRemaining();
    setRemaining(initialRemaining);
    setIsExpired(initialRemaining <= 0);

    if (initialRemaining <= 0) {
      onComplete?.();
      return;
    }

    // Update every 1 second
    const interval = setInterval(() => {
      const newRemaining = calculateRemaining();
      setRemaining(newRemaining);

      if (newRemaining <= 0) {
        setIsExpired(true);
        onComplete?.();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime, onComplete]);

  return {
    remaining,
    formatted: formatTime(remaining),
    isExpired,
  };
}
