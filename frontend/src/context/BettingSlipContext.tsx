"use client";
/**
 * BettingSlipContext
 *
 * Global state for the betting slip queue.
 * Manages up to MAX_BETS queued bets across the app.
 *
 * State transitions:
 *   addBet    → appends to bets[] if queue < MAX_BETS, else fires onQueueFull callback
 *   removeBet → filters out bet by id
 *   clearBets → resets bets[] to []
 *   open/close → toggles the slip drawer/panel visibility
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export const MAX_BETS = 5;

export interface QueuedBet {
  /** Unique id: marketId + outcomeIndex composite */
  id: string;
  marketId: number;
  marketTitle: string;
  outcomeIndex: number;
  outcomeName: string;
  amount: number;
}

interface BettingSlipState {
  isOpen: boolean;
  bets: QueuedBet[];
  open: () => void;
  close: () => void;
  /** Returns false and calls onQueueFull if queue is already at MAX_BETS */
  addBet: (bet: Omit<QueuedBet, "id">, onQueueFull?: () => void) => boolean;
  removeBet: (id: string) => void;
  clearBets: () => void;
}

const BettingSlipContext = createContext<BettingSlipState | null>(null);

export function BettingSlipProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [bets, setBets] = useState<QueuedBet[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const addBet = useCallback(
    (bet: Omit<QueuedBet, "id">, onQueueFull?: () => void): boolean => {
      // Reject if queue is full
      if (bets.length >= MAX_BETS) {
        onQueueFull?.();
        return false;
      }
      const id = `${bet.marketId}-${bet.outcomeIndex}`;
      // Replace existing entry for same market+outcome rather than duplicating
      setBets((prev) => {
        const filtered = prev.filter((b) => b.id !== id);
        return [...filtered, { ...bet, id }];
      });
      // Auto-open the slip when a bet is added
      setIsOpen(true);
      return true;
    },
    [bets.length]
  );

  const removeBet = useCallback((id: string) => {
    setBets((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const clearBets = useCallback(() => setBets([]), []);

  return (
    <BettingSlipContext.Provider value={{ isOpen, bets, open, close, addBet, removeBet, clearBets }}>
      {children}
    </BettingSlipContext.Provider>
  );
}

export function useBettingSlip(): BettingSlipState {
  const ctx = useContext(BettingSlipContext);
  if (!ctx) throw new Error("useBettingSlip must be used inside BettingSlipProvider");
  return ctx;
}
