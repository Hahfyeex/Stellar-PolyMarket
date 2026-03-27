/**
 * Unit tests for useOnboarding hook
 * Covers: step navigation, skip, complete, localStorage persistence, reset
 * Target: >90% line/branch/function coverage
 */
import { renderHook, act } from "@testing-library/react";
import { useOnboarding, ONBOARDING_STORAGE_KEY, TOTAL_STEPS } from "../useOnboarding";

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => localStorageMock.clear());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useOnboarding", () => {
  it("shows wizard when localStorage key is absent", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showWizard).toBe(true);
  });

  it("hides wizard when localStorage key is 'true'", () => {
    localStorageMock.setItem(ONBOARDING_STORAGE_KEY, "true");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showWizard).toBe(false);
  });

  it("starts at step 0", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.currentStep).toBe(0);
  });

  it("nextStep advances to step 1", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.nextStep());
    expect(result.current.currentStep).toBe(1);
  });

  it("nextStep advances through all steps", () => {
    const { result } = renderHook(() => useOnboarding());
    for (let i = 0; i < TOTAL_STEPS - 1; i++) {
      act(() => result.current.nextStep());
    }
    expect(result.current.currentStep).toBe(TOTAL_STEPS - 1);
  });

  it("nextStep on last step marks complete and hides wizard", () => {
    const { result } = renderHook(() => useOnboarding());
    // Advance to last step
    for (let i = 0; i < TOTAL_STEPS - 1; i++) {
      act(() => result.current.nextStep());
    }
    // One more next on last step
    act(() => result.current.nextStep());
    expect(result.current.showWizard).toBe(false);
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("prevStep goes back one step", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.nextStep());
    act(() => result.current.nextStep());
    act(() => result.current.prevStep());
    expect(result.current.currentStep).toBe(1);
  });

  it("prevStep is a no-op on step 0", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.prevStep());
    expect(result.current.currentStep).toBe(0);
  });

  it("goToStep jumps to a specific step", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.goToStep(3));
    expect(result.current.currentStep).toBe(3);
  });

  it("goToStep clamps to 0 for negative values", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.goToStep(-5));
    expect(result.current.currentStep).toBe(0);
  });

  it("goToStep clamps to TOTAL_STEPS-1 for out-of-range values", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.goToStep(99));
    expect(result.current.currentStep).toBe(TOTAL_STEPS - 1);
  });

  it("skip hides wizard and sets localStorage", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.skip());
    expect(result.current.showWizard).toBe(false);
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("skip works from any step", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.nextStep());
    act(() => result.current.nextStep());
    act(() => result.current.skip());
    expect(result.current.showWizard).toBe(false);
  });

  it("complete hides wizard and sets localStorage", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.complete());
    expect(result.current.showWizard).toBe(false);
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("resetOnboarding clears localStorage and shows wizard again", () => {
    localStorageMock.setItem(ONBOARDING_STORAGE_KEY, "true");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showWizard).toBe(false);
    act(() => result.current.resetOnboarding());
    expect(result.current.showWizard).toBe(true);
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  });

  it("resetOnboarding resets step to 0", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.goToStep(2));
    act(() => result.current.resetOnboarding());
    expect(result.current.currentStep).toBe(0);
  });

  it("TOTAL_STEPS is 4", () => {
    expect(TOTAL_STEPS).toBe(4);
  });

  it("ONBOARDING_STORAGE_KEY is documented string", () => {
    expect(typeof ONBOARDING_STORAGE_KEY).toBe("string");
    expect(ONBOARDING_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});
