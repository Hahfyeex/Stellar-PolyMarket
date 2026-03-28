/**
 * Tests for OnboardingWizard component — Issue #486
 * Covers: first-visit trigger, subsequent-visit suppression,
 *         step navigation, skip flow, completion flow, step content.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import { ONBOARDING_STORAGE_KEY } from "../../hooks/useOnboarding";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// WalletContext
jest.mock("../../context/WalletContext", () => ({
  useWalletContext: () => ({
    publicKey: null,
    connecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    error: null,
  }),
}));

// localStorage
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWizard() {
  return render(<OnboardingWizard />);
}

function clickNext() {
  fireEvent.click(screen.getByTestId("next-button"));
}

function clickFinish() {
  fireEvent.click(screen.getByTestId("finish-button"));
}

function clickSkip() {
  fireEvent.click(screen.getByTestId("skip-button"));
}

// ── First-visit / subsequent-visit ───────────────────────────────────────────

describe("OnboardingWizard — visibility", () => {
  it("shows wizard on first visit (no localStorage key)", () => {
    renderWizard();
    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
  });

  it("does NOT show wizard when onboardingComplete is already set", () => {
    localStorageMock.setItem(ONBOARDING_STORAGE_KEY, "true");
    renderWizard();
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });

  it("has role=dialog and aria-modal=true", () => {
    renderWizard();
    const dialog = screen.getByTestId("onboarding-wizard");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});

// ── Step content ──────────────────────────────────────────────────────────────

describe("OnboardingWizard — step content", () => {
  it("renders Step 1: Connect Wallet", () => {
    renderWizard();
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
  });

  it("renders Step 2: How Markets Work after Next", () => {
    renderWizard();
    clickNext();
    expect(screen.getByText("How Markets Work")).toBeInTheDocument();
  });

  it("renders Step 3: Placing a Bet after two Next clicks", () => {
    renderWizard();
    clickNext();
    clickNext();
    expect(screen.getByText("Placing a Bet")).toBeInTheDocument();
  });

  it("renders Step 4: How Payouts Work after three Next clicks", () => {
    renderWizard();
    clickNext();
    clickNext();
    clickNext();
    expect(screen.getByText("How Payouts Work")).toBeInTheDocument();
  });

  it("shows finish button on last step instead of next", () => {
    renderWizard();
    clickNext(); clickNext(); clickNext();
    expect(screen.getByTestId("finish-button")).toBeInTheDocument();
    expect(screen.queryByTestId("next-button")).not.toBeInTheDocument();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe("OnboardingWizard — navigation", () => {
  it("Back button is disabled on step 1", () => {
    renderWizard();
    expect(screen.getByTestId("prev-button")).toBeDisabled();
  });

  it("Back button is enabled after advancing", () => {
    renderWizard();
    clickNext();
    expect(screen.getByTestId("prev-button")).not.toBeDisabled();
  });

  it("Back button returns to previous step", () => {
    renderWizard();
    clickNext();
    fireEvent.click(screen.getByTestId("prev-button"));
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
  });

  it("shows step counter", () => {
    renderWizard();
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });

  it("step counter updates on Next", () => {
    renderWizard();
    clickNext();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });
});

// ── Skip flow ─────────────────────────────────────────────────────────────────

describe("OnboardingWizard — skip", () => {
  it("Skip button is present on every step", () => {
    renderWizard();
    expect(screen.getByTestId("skip-button")).toBeInTheDocument();
    clickNext();
    expect(screen.getByTestId("skip-button")).toBeInTheDocument();
  });

  it("clicking Skip closes the wizard", () => {
    renderWizard();
    clickSkip();
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });

  it("clicking Skip sets onboardingComplete in localStorage", () => {
    renderWizard();
    clickSkip();
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("Skip works from a middle step", () => {
    renderWizard();
    clickNext();
    clickNext();
    clickSkip();
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });
});

// ── Completion flow ───────────────────────────────────────────────────────────

describe("OnboardingWizard — completion", () => {
  it("completing Step 4 closes the wizard", () => {
    renderWizard();
    clickNext(); clickNext(); clickNext();
    clickFinish();
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });

  it("completing Step 4 sets onboardingComplete in localStorage", () => {
    renderWizard();
    clickNext(); clickNext(); clickNext();
    clickFinish();
    expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("wizard does not reappear after completion (re-render)", () => {
    const { unmount } = renderWizard();
    clickNext(); clickNext(); clickNext();
    clickFinish();
    unmount();
    // Re-render simulates a page navigation — localStorage is already set
    render(<OnboardingWizard />);
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });
});
