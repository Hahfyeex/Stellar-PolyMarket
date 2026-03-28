/**
 * Accessibility Tests — feat/487-accessibility-audit
 *
 * Verifies WCAG 2.1 AA requirements across key components:
 *   - aria-live on toast container
 *   - aria-label on dismiss button in ToastProvider
 *   - aria-label + aria-expanded on NotificationInbox bell button
 *   - aria-hidden on decorative SVGs
 *   - keyboard support on notification list items
 *   - aria-pressed on SlippageSettings preset buttons
 *   - label association on TradeDrawer amount input
 *   - aria-pressed on TradeDrawer outcome buttons
 *   - role="group" + aria-label on outcome button group
 *   - SkipLink renders and points to #main-content
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));

jest.mock("../../lib/firebase", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("../../hooks/useFormPersistence", () => ({
  useFormPersistence: () => ({
    outcomeIndex: null,
    amount: "",
    slippageTolerance: 0.5,
    setOutcomeIndex: jest.fn(),
    setAmount: jest.fn(),
    setSlippageTolerance: jest.fn(),
    clearForm: jest.fn(),
  }),
}));

jest.mock("../../hooks/useSlippageCheck", () => ({
  useSlippageCheck: () => ({
    checkSlippage: jest.fn().mockResolvedValue(true),
    slippageState: null,
    dismiss: jest.fn(),
    checking: false,
  }),
}));

jest.mock("react-redux", () => ({
  useDispatch: () => jest.fn(),
  useSelector: () => [],
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...rest}>{children}</div>
    ),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { ToastProvider, useToast } from "../ToastProvider";
import NotificationInbox from "../NotificationInbox";
import SlippageSettings from "../SlippageSettings";
import TradeDrawer from "../mobile/TradeDrawer";
import SkipLink from "../SkipLink";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Helpers ───────────────────────────────────────────────────────────────────

function createQCWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const SAMPLE_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k?",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
};

// ── ToastProvider ─────────────────────────────────────────────────────────────

describe("ToastProvider — accessibility", () => {
  function ToastTrigger() {
    const { success } = useToast();
    return <button onClick={() => success("Bet placed!")}>Trigger</button>;
  }

  function Wrapper() {
    return (
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
  }

  it("toast container has aria-live='polite'", () => {
    render(<Wrapper />);
    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).toBeInTheDocument();
  });

  it("toast container has aria-atomic='false'", () => {
    render(<Wrapper />);
    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).toHaveAttribute("aria-atomic", "false");
  });

  it("dismiss button has aria-label", () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Trigger"));
    const dismissBtn = screen.getByRole("button", { name: /dismiss notification/i });
    expect(dismissBtn).toBeInTheDocument();
  });

  it("toast message is rendered inside the live region", () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Trigger"));
    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).toHaveTextContent("Bet placed!");
  });
});

// ── NotificationInbox ─────────────────────────────────────────────────────────

describe("NotificationInbox — accessibility", () => {
  it("bell button has descriptive aria-label", () => {
    render(<NotificationInbox walletAddress={null} />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    expect(btn).toBeInTheDocument();
  });

  it("bell button has aria-expanded=false when closed", () => {
    render(<NotificationInbox walletAddress={null} />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("bell button has aria-expanded=true when open", () => {
    render(<NotificationInbox walletAddress={null} />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("bell button has aria-haspopup='dialog'", () => {
    render(<NotificationInbox walletAddress={null} />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("bell SVG is aria-hidden", () => {
    render(<NotificationInbox walletAddress={null} />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    const svg = btn.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("dropdown has role='dialog' when open", () => {
    render(<NotificationInbox walletAddress={null} />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ── SlippageSettings ──────────────────────────────────────────────────────────

describe("SlippageSettings — accessibility", () => {
  it("active preset button has aria-pressed=true", () => {
    render(<SlippageSettings value={1} onChange={jest.fn()} />);
    const btn = screen.getByTestId("slippage-preset-1");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("inactive preset buttons have aria-pressed=false", () => {
    render(<SlippageSettings value={1} onChange={jest.fn()} />);
    expect(screen.getByTestId("slippage-preset-0.5")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("slippage-preset-2")).toHaveAttribute("aria-pressed", "false");
  });

  it("custom button has aria-pressed=false when a preset is active", () => {
    render(<SlippageSettings value={1} onChange={jest.fn()} />);
    expect(screen.getByTestId("slippage-preset-custom")).toHaveAttribute("aria-pressed", "false");
  });

  it("custom button has aria-pressed=true when in custom mode", () => {
    render(<SlippageSettings value={0.5} onChange={jest.fn()} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    expect(screen.getByTestId("slippage-preset-custom")).toHaveAttribute("aria-pressed", "true");
  });

  it("custom input has aria-label", () => {
    render(<SlippageSettings value={0.5} onChange={jest.fn()} />);
    fireEvent.click(screen.getByTestId("slippage-preset-custom"));
    const input = screen.getByTestId("slippage-custom-input");
    expect(input).toHaveAttribute("aria-label");
  });
});

// ── TradeDrawer ───────────────────────────────────────────────────────────────

describe("TradeDrawer — accessibility", () => {
  it("amount input has an associated label via aria-label", () => {
    render(
      <TradeDrawer
        market={SAMPLE_MARKET}
        open={true}
        onClose={jest.fn()}
        walletAddress="GTEST1234WALLET"
      />,
      { wrapper: createQCWrapper() }
    );
    const input = screen.getByPlaceholderText("Amount (XLM)");
    expect(input).toHaveAttribute("aria-label");
  });

  it("amount input has an id for label association", () => {
    render(
      <TradeDrawer
        market={SAMPLE_MARKET}
        open={true}
        onClose={jest.fn()}
        walletAddress="GTEST1234WALLET"
      />,
      { wrapper: createQCWrapper() }
    );
    const input = screen.getByPlaceholderText("Amount (XLM)");
    expect(input).toHaveAttribute("id", "trade-drawer-amount");
  });

  it("outcome button group has role='group' and aria-label", () => {
    render(
      <TradeDrawer
        market={SAMPLE_MARKET}
        open={true}
        onClose={jest.fn()}
        walletAddress={null}
      />,
      { wrapper: createQCWrapper() }
    );
    const group = screen.getByRole("group", { name: /select outcome/i });
    expect(group).toBeInTheDocument();
  });

  it("outcome buttons have aria-pressed=false when not selected", () => {
    render(
      <TradeDrawer
        market={SAMPLE_MARKET}
        open={true}
        onClose={jest.fn()}
        walletAddress={null}
      />,
      { wrapper: createQCWrapper() }
    );
    const yesBtn = screen.getByRole("button", { name: "Yes" });
    expect(yesBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("outcome button has aria-pressed=true when selected", () => {
    render(
      <TradeDrawer
        market={SAMPLE_MARKET}
        open={true}
        onClose={jest.fn()}
        walletAddress={null}
      />,
      { wrapper: createQCWrapper() }
    );
    const yesBtn = screen.getByRole("button", { name: "Yes" });
    fireEvent.click(yesBtn);
    expect(yesBtn).toHaveAttribute("aria-pressed", "true");
  });
});

// ── SkipLink ──────────────────────────────────────────────────────────────────

describe("SkipLink — accessibility", () => {
  it("renders a skip link pointing to #main-content", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to main content/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#main-content");
  });

  it("skip link is visually hidden by default (sr-only)", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to main content/i });
    expect(link.className).toContain("sr-only");
  });

  it("skip link becomes visible on focus", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to main content/i });
    expect(link.className).toContain("focus:not-sr-only");
  });
});
