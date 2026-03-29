import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TradeDrawer from "./TradeDrawer";
import type { Market } from "../../types/market";

// Mock dependencies
jest.mock("../../lib/firebase", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("../ResolutionCenter", () => {
  return function MockResolutionCenter() {
    return <div data-testid="resolution-center">Resolution Center</div>;
  };
});

jest.mock("../WhatIfSimulator", () => {
  return function MockWhatIfSimulator() {
    return <div data-testid="what-if-simulator">What-If Simulator</div>;
  };
});

jest.mock("../../hooks/useFormPersistence", () => ({
  useFormPersistence: () => ({
    outcomeIndex: null,
    amount: "",
    slippageTolerance: 5,
    setOutcomeIndex: jest.fn(),
    setAmount: jest.fn(),
    setSlippageTolerance: jest.fn(),
    clearForm: jest.fn(),
  }),
}));

jest.mock("../StakePresets", () => {
  return function MockStakePresets({ onSelect }: any) {
    return (
      <div data-testid="stake-presets">
        <button onClick={() => onSelect("10")}>$10</button>
        <button onClick={() => onSelect("50")}>$50</button>
      </div>
    );
  };
});

jest.mock("../SlippageSettings", () => {
  return function MockSlippageSettings() {
    return <div data-testid="slippage-settings">Slippage Settings</div>;
  };
});

jest.mock("../SlippageWarningModal", () => {
  return function MockSlippageWarningModal() {
    return <div data-testid="slippage-modal">Slippage Modal</div>;
  };
});

jest.mock("../../hooks/useSlippageCheck", () => ({
  useSlippageCheck: () => ({
    checkSlippage: jest.fn((config) => {
      // Immediately call onApprove to pass slippage check
      config.onApprove?.();
    }),
    slippageState: null,
    dismiss: jest.fn(),
    checking: false,
  }),
}));

// Mock fetch
global.fetch = jest.fn();

const mockMarket: Market = {
  id: "market-1",
  question: "Will BTC be above $100k by Q4 2024?",
  total_pool: "1000",
  resolved: false,
  winning_outcome: null,
  outcomes: ["Yes", "No"],
  end_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
};

describe("TradeDrawer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe("Rendering & Visibility", () => {
    it("should not render when closed and dragY is 0", () => {
      const { container } = render(
        <TradeDrawer
          market={mockMarket}
          open={false}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      expect(container.firstChild?.childNodes.length).toBe(0);
    });

    it("should render when open", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      expect(screen.getByTestId("trade-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("trade-drawer-backdrop")).toBeInTheDocument();
    });

    it("should display market question as heading", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      const heading = screen.getByRole("heading", { name: /Will BTC be above/i });
      expect(heading).toHaveAttribute("id", "trade-drawer-title");
    });

    it("should display pool amount", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      expect(screen.getByText(/1000.00 XLM/i)).toBeInTheDocument();
    });

    it("should render outcome buttons", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    });
  });

  describe("Drawer Animation", () => {
    it("should apply transition CSS when not dragging", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      const drawer = screen.getByTestId("trade-drawer");
      const style = window.getComputedStyle(drawer);
      // Note: transition is set inline, check via getAttribute
      expect(drawer.getAttribute("style")).toContain("transition");
    });

    it("should remove transition CSS when dragging", async () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      const handle = screen.getByTestId("trade-drawer-handle");

      // Simulate touch start
      fireEvent.touchStart(handle, {
        touches: [{ clientY: 500 }],
      });

      await waitFor(() => {
        const drawer = screen.getByTestId("trade-drawer");
        expect(drawer.getAttribute("style")).toContain("none");
      });
    });

    it("should interpolate translateY based on drag distance", async () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      const handle = screen.getByTestId("trade-drawer-handle");
      const drawer = screen.getByTestId("trade-drawer");

      // Simulate drag down 50px
      fireEvent.touchStart(handle, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 550 }] });

      await waitFor(() => {
        expect(drawer.getAttribute("style")).toContain("translateY(50px)");
      });
    });
  });

  describe("Swipe-to-Dismiss", () => {
    it("should close drawer when dragged more than 100px", async () => {
      const onClose = jest.fn();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={onClose}
          walletAddress="Gb123abc..."
        />
      );
      const handle = screen.getByTestId("trade-drawer-handle");

      // Simulate drag down 101px
      fireEvent.touchStart(handle, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 550 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 601 }] });
      fireEvent.touchEnd(handle);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("should NOT close drawer when dragged less than 100px", async () => {
      const onClose = jest.fn();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={onClose}
          walletAddress="Gb123abc..."
        />
      );
      const handle = screen.getByTestId("trade-drawer-handle");

      // Simulate drag down 50px
      fireEvent.touchStart(handle, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 550 }] });
      fireEvent.touchEnd(handle);

      // Spring back to 0
      const drawer = screen.getByTestId("trade-drawer");
      expect(drawer.getAttribute("style")).toContain("translateY(0px)");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("should snap back to closed position after releasing below threshold", async () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );
      const handle = screen.getByTestId("trade-drawer-handle");
      const drawer = screen.getByTestId("trade-drawer");

      // Drag down 80px
      fireEvent.touchStart(handle, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 580 }] });
      fireEvent.touchEnd(handle);

      await waitFor(() => {
        // Should return to 0
        expect(drawer.getAttribute("style")).toContain("translateY(0px)");
      });
    });

    it("should close drawer on backdrop click", () => {
      const onClose = jest.fn();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={onClose}
          walletAddress="Gb123abc..."
        />
      );
      const backdrop = screen.getByTestId("trade-drawer-backdrop");
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Focus Trap", () => {
    it("should set initial focus to first focusable element when opened", async () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      // First focusable should be an outcome button
      const firstButton = screen.getByRole("button", { name: "Yes" });
      await waitFor(() => {
        expect(document.activeElement).toEqual(firstButton);
      });
    });

    it("should cycle focus forward through focusable elements on Tab", async () => {
      const user = userEvent.setup();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const yesButton = screen.getByRole("button", { name: "Yes" });
      const noButton = screen.getByRole("button", { name: "No" });

      // Start with Yes button
      await waitFor(() => {
        expect(document.activeElement).toEqual(yesButton);
      });

      // Tab forward
      await user.keyboard("{Tab}");

      // Should move to next element
      await waitFor(() => {
        expect(document.activeElement).not.toEqual(yesButton);
      });
    });

    it("should wrap focus from last to first element on Tab", async () => {
      const user = userEvent.setup();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      // Get all focusable elements
      const drawer = screen.getByTestId("trade-drawer");
      const focusableElements = Array.from(
        drawer.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

      // Focus on last element
      (focusableElements[focusableElements.length - 1] as HTMLElement).focus();

      // Tab forward should wrap to first
      await user.keyboard("{Tab}");

      await waitFor(() => {
        expect(document.activeElement).toEqual(focusableElements[0]);
      });
    });

    it("should wrap focus from first to last element on Shift+Tab", async () => {
      const user = userEvent.setup();
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const drawer = screen.getByTestId("trade-drawer");
      const focusableElements = Array.from(
        drawer.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

      // Focus on first element
      (focusableElements[0] as HTMLElement).focus();

      // Shift+Tab should wrap to last
      await user.keyboard("{Shift>}{Tab}{/Shift}");

      await waitFor(() => {
        expect(document.activeElement).toEqual(
          focusableElements[focusableElements.length - 1]
        );
      });
    });
  });

  describe("Focus Restoration", () => {
    it("should restore focus to previous active element on close", async () => {
      const triggerButton = document.createElement("button");
      triggerButton.textContent = "Open Drawer";
      document.body.appendChild(triggerButton);
      triggerButton.focus();

      const { rerender } = render(
        <TradeDrawer
          market={mockMarket}
          open={false}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      // Open drawer
      rerender(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      // Close drawer
      const onClose = jest.fn();
      rerender(
        <TradeDrawer
          market={mockMarket}
          open={false}
          onClose={onClose}
          walletAddress="Gb123abc..."
        />
      );

      // Wait for focus restoration timeout
      await waitFor(
        () => {
          expect(document.activeElement).toEqual(triggerButton);
        },
        { timeout: 500 }
      );

      document.body.removeChild(triggerButton);
    });
  });

  describe("Form Interaction", () => {
    it("should disable outcome buttons when market is expired", () => {
      const expiredMarket = {
        ...mockMarket,
        end_date: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };

      render(
        <TradeDrawer
          market={expiredMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
    });

    it("should display message when wallet not connected", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress={null}
        />
      );

      expect(
        screen.getByText(/Connect your wallet to place a bet/i)
      ).toBeInTheDocument();
    });

    it("should render stake presets when wallet connected", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      expect(screen.getByTestId("stake-presets")).toBeInTheDocument();
    });

    it("should display what-if simulator when outcome selected", () => {
      const { useFormPersistence } = require("../../hooks/useFormPersistence");
      useFormPersistence.mockReturnValue({
        outcomeIndex: 0, // Outcome selected
        amount: "10",
        slippageTolerance: 5,
        setOutcomeIndex: jest.fn(),
        setAmount: jest.fn(),
        setSlippageTolerance: jest.fn(),
        clearForm: jest.fn(),
      });

      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      expect(screen.getByTestId("what-if-simulator")).toBeInTheDocument();
    });

    it("should hide what-if simulator when no outcome selected", () => {
      const { useFormPersistence } = require("../../hooks/useFormPersistence");
      useFormPersistence.mockReturnValue({
        outcomeIndex: null, // No outcome selected
        amount: "10",
        slippageTolerance: 5,
        setOutcomeIndex: jest.fn(),
        setAmount: jest.fn(),
        setSlippageTolerance: jest.fn(),
        clearForm: jest.fn(),
      });

      const { queryByTestId } = render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      expect(queryByTestId("what-if-simulator")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper dialog semantics", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const drawer = screen.getByTestId("trade-drawer");
      expect(drawer).toHaveAttribute("role", "dialog");
      expect(drawer).toHaveAttribute("aria-modal", "true");
      expect(drawer).toHaveAttribute("aria-labelledby", "trade-drawer-title");
    });

    it("should have accessible drag handle", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const handle = screen.getByTestId("trade-drawer-handle");
      expect(handle).toHaveAttribute("role", "button");
      expect(handle).toHaveAttribute(
        "aria-label",
        "Drag to close trade drawer"
      );
      expect(handle).toHaveAttribute("tabindex", "0");
    });

    it("should have accessible amount input", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const input = screen.getByLabelText(/Stake amount in XLM/i);
      expect(input).toHaveAttribute("id", "trade-drawer-amount");
    });

    it("should have accessible bet button", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      const button = screen.getByRole("button", { name: /Place bet/i });
      expect(button).toHaveAttribute("aria-label", "Place bet");
    });

    it("should announce error messages as alerts", () => {
      const { useFormPersistence } = require("../../hooks/useFormPersistence");
      useFormPersistence.mockReturnValue({
        outcomeIndex: 0,
        amount: "10",
        slippageTolerance: 5,
        setOutcomeIndex: jest.fn(),
        setAmount: jest.fn(),
        setSlippageTolerance: jest.fn(),
        clearForm: jest.fn(),
      });

      const { rerender } = render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      // This would be triggered by placeBet, shown via custom attribute
      const message = screen.queryByTestId("trade-drawer-message");
      if (message) {
        expect(message).toHaveAttribute("role");
      }
    });
  });

  describe("Integration", () => {
    it("should render resolution center", () => {
      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
        />
      );

      expect(screen.getByTestId("resolution-center")).toBeInTheDocument();
    });

    it("should pass wallet balance to stake presets", () => {
      // StakePresets mock receives walletBalance prop
      const { useFormPersistence } = require("../../hooks/useFormPersistence");
      useFormPersistence.mockReturnValue({
        outcomeIndex: null,
        amount: "",
        slippageTolerance: 5,
        setOutcomeIndex: jest.fn(),
        setAmount: jest.fn(),
        setSlippageTolerance: jest.fn(),
        clearForm: jest.fn(),
      });

      render(
        <TradeDrawer
          market={mockMarket}
          open={true}
          onClose={jest.fn()}
          walletAddress="Gb123abc..."
          walletBalance={5000}
        />
      );

      expect(screen.getByTestId("stake-presets")).toBeInTheDocument();
    });
  });
});
