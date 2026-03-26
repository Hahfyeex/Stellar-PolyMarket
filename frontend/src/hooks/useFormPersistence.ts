/**
 * useFormPersistence
 *
 * Persists and restores bet form state to/from localStorage on a per-market basis.
 *
 * Storage key format:
 *   stella_bet_form_{marketId}
 *   e.g. "stella_bet_form_42"
 *
 * Persisted fields:
 *   - outcomeIndex    (number | null)  — selected outcome button
 *   - amount          (string)         — stake input value
 *   - slippageTolerance (number)       — slippage % (default 0.5)
 *
 * Lifecycle:
 *   mount  → read from localStorage, populate state
 *   change → write to localStorage on every field update (debounced 300ms)
 *   submit → call clearPersistedForm(marketId) to remove the key
 *   clear  → call clearPersistedForm(marketId) + reset all fields to defaults
 */
import { useState, useEffect, useCallback, useRef } from "react";

/** Shape of the persisted form data */
export interface PersistedBetForm {
  outcomeIndex: number | null;
  amount: string;
  slippageTolerance: number;
}

const STORAGE_PREFIX = "stella_bet_form_";
const DEBOUNCE_MS = 300;

/** Build the localStorage key for a given market */
export function storageKey(marketId: number): string {
  return `${STORAGE_PREFIX}${marketId}`;
}

/** Read persisted form state from localStorage. Returns null if nothing stored. */
export function readPersistedForm(marketId: number): PersistedBetForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(marketId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedBetForm;
  } catch {
    // Corrupted data — treat as empty
    return null;
  }
}

/** Write form state to localStorage */
export function writePersistedForm(marketId: number, form: PersistedBetForm): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(marketId), JSON.stringify(form));
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}

/** Remove the persisted form entry for a market (call on submit or manual clear) */
export function clearPersistedForm(marketId: number): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(marketId));
}

const DEFAULTS: PersistedBetForm = {
  outcomeIndex: null,
  amount: "",
  slippageTolerance: 0.5,
};

interface UseFormPersistenceResult {
  outcomeIndex: number | null;
  amount: string;
  slippageTolerance: number;
  setOutcomeIndex: (v: number | null) => void;
  setAmount: (v: string) => void;
  setSlippageTolerance: (v: number) => void;
  /** Call after successful bet submission — clears storage and resets fields */
  clearForm: () => void;
}

export function useFormPersistence(marketId: number): UseFormPersistenceResult {
  // Initialise from localStorage on first render
  const [outcomeIndex, setOutcomeIndexState] = useState<number | null>(() => {
    const saved = readPersistedForm(marketId);
    return saved?.outcomeIndex ?? DEFAULTS.outcomeIndex;
  });
  const [amount, setAmountState] = useState<string>(() => {
    const saved = readPersistedForm(marketId);
    return saved?.amount ?? DEFAULTS.amount;
  });
  const [slippageTolerance, setSlippageState] = useState<number>(() => {
    const saved = readPersistedForm(marketId);
    return saved?.slippageTolerance ?? DEFAULTS.slippageTolerance;
  });

  // Debounce timer ref — avoids writing on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Write to localStorage whenever any field changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writePersistedForm(marketId, { outcomeIndex, amount, slippageTolerance });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [marketId, outcomeIndex, amount, slippageTolerance]);

  // Re-hydrate when marketId changes (switching between markets)
  useEffect(() => {
    const saved = readPersistedForm(marketId);
    setOutcomeIndexState(saved?.outcomeIndex ?? DEFAULTS.outcomeIndex);
    setAmountState(saved?.amount ?? DEFAULTS.amount);
    setSlippageState(saved?.slippageTolerance ?? DEFAULTS.slippageTolerance);
  }, [marketId]);

  const clearForm = useCallback(() => {
    // Remove from storage and reset all fields to defaults
    clearPersistedForm(marketId);
    setOutcomeIndexState(DEFAULTS.outcomeIndex);
    setAmountState(DEFAULTS.amount);
    setSlippageState(DEFAULTS.slippageTolerance);
  }, [marketId]);

  return {
    outcomeIndex,
    amount,
    slippageTolerance,
    setOutcomeIndex: setOutcomeIndexState,
    setAmount: setAmountState,
    setSlippageTolerance: setSlippageState,
    clearForm,
  };
}
