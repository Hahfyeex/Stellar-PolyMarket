/**
 * useOnboarding
 *
 * Manages onboarding wizard state with localStorage persistence.
 *
 * localStorage key structure:
 * ─────────────────────────────────────────────────────────────────
 * Key:   "stella_onboarding_complete"
 * Type:  "true" | absent
 * Set:   When user completes step 4 OR clicks Skip from any step.
 * Clear: Call resetOnboarding() — useful for testing/debugging.
 *
 * Why localStorage (not sessionStorage):
 *   Persists across browser restarts so returning users never see
 *   the wizard again. sessionStorage would re-show on every new tab.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useCallback } from "react";

/** The localStorage key used to persist onboarding completion */
export const ONBOARDING_STORAGE_KEY = "stella_onboarding_complete";

export interface UseOnboardingResult {
  /** Whether the wizard should be shown (false = already completed) */
  showWizard: boolean;
  /** Current step index (0–3) */
  currentStep: number;
  /** Advance to the next step; marks complete if on last step */
  nextStep: () => void;
  /** Go back one step (no-op on step 0) */
  prevStep: () => void;
  /** Jump directly to a specific step */
  goToStep: (step: number) => void;
  /** Skip wizard entirely and mark as complete */
  skip: () => void;
  /** Mark onboarding complete (called on final step) */
  complete: () => void;
  /** Clear localStorage key — for testing/debugging only */
  resetOnboarding: () => void;
}

export const TOTAL_STEPS = 4;

export function useOnboarding(): UseOnboardingResult {
  // Read completion flag from localStorage on first render (SSR-safe)
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "true";
  });

  const [currentStep, setCurrentStep] = useState(0);

  const markComplete = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    }
    setShowWizard(false);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= TOTAL_STEPS) {
        markComplete();
        return prev; // step stays at last while wizard closes
      }
      return next;
    });
  }, [markComplete]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.min(Math.max(0, step), TOTAL_STEPS - 1));
  }, []);

  const skip = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const complete = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const resetOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
    setCurrentStep(0);
    setShowWizard(true);
  }, []);

  return {
    showWizard,
    currentStep,
    nextStep,
    prevStep,
    goToStep,
    skip,
    complete,
    resetOnboarding,
  };
}
