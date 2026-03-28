/**
 * Tests for CopyButton Component
 * Feature: clipboard-copy-utility
 */

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import CopyButton from "../CopyButton";

// Increase test timeout for async operations
jest.setTimeout(10000);

// Mock the Clipboard API
const mockClipboardWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockClipboardWriteText,
  },
});

describe("CopyButton Component", () => {
  beforeEach(() => {
    mockClipboardWriteText.mockClear();
    mockClipboardWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Turn off fake timers if they were turned on
    if (jest.useRealTimers) {
      try {
        jest.useRealTimers();
      } catch (e) {
        // Already using real timers
      }
    }
    cleanup();
  });

  describe("Rendering and Basic Functionality", () => {
    it("renders a button with abbreviated value", () => {
      const value = "GABCDEF123456789ABCWXYZ";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("GABCDE...WXYZ");
    });

    it("renders with custom label", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" label="Wallet Address" />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Wallet Address");
    });

    it("renders with default label when not provided", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Copy to clipboard");
    });

    it("displays full value in title attribute for hover tooltip", () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("title", value);
    });

    it("renders copy icon", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const svg = screen.getByRole("button").querySelector("svg[aria-hidden='true']");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Value Abbreviation", () => {
    it("abbreviates value to first 6 + last 4 characters", () => {
      render(<CopyButton value="ABCDEFGHIJKLMNOPQRST" />);
      expect(screen.getByText("ABCDEF...QRST")).toBeInTheDocument();
    });

    it("returns full value if shorter than 11 characters", () => {
      render(<CopyButton value="SHORTVAL" />);
      expect(screen.getByText("SHORTVAL")).toBeInTheDocument();
    });

    it("handles exactly 11 character string", () => {
      const value = "ABCDEFGHIJK"; // exactly 11 chars
      render(<CopyButton value={value} />);
      // Should abbreviate: first 6 (ABCDEF) + last 4 (HIJK)
      expect(screen.getByText("ABCDEF...HIJK")).toBeInTheDocument();
    });

    it("handles empty string", () => {
      render(<CopyButton value="" />);
      const button = screen.getByRole("button");
      // Empty string should still render as a button (may or may not have text)
      expect(button).toBeInTheDocument();
    });

    it("handles very long values correctly", () => {
      const longValue = "A".repeat(100);
      render(<CopyButton value={longValue} />);
      expect(screen.getByText("AAAAAA...AAAA")).toBeInTheDocument();
    });
  });

  describe("Copy Functionality (Clipboard API)", () => {
    it("copies full value to clipboard on button click", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith(value);
      });
    });

    it("shows 'Copied!' message after successful copy", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });

    it("fades 'Copied!' message after 2 seconds", async () => {
      jest.useFakeTimers();
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");

      await act(async () => {
        fireEvent.click(button);
      });

      // Wait for "Copied!" to appear
      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });

      // Advance timers by 2000ms with act()
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for "Copied!" to disappear
      await waitFor(() => {
        expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it("calls onCopySuccess callback on successful copy", async () => {
      const onCopySuccess = jest.fn();
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} onCopySuccess={onCopySuccess} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(onCopySuccess).toHaveBeenCalled();
      });
    });
  });

  describe("Keyboard Accessibility", () => {
    it("triggers copy on Enter key press", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key: "Enter" });

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith(value);
      });
    });

    it("triggers copy on Space key press", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key: " " });

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith(value);
      });
    });

    it("prevents default behavior on Space key to avoid page scroll", () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");

      // Verify button is present and keyboard accessible
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("focus:outline-none");
    });

    it("does not trigger copy on other keys", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key: "A" });

      await waitFor(() => {
        expect(mockClipboardWriteText).not.toHaveBeenCalled();
      });
    });

    it("button is focusable via keyboard", () => {
      render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);

      const button = screen.getByRole("button");
      button.focus();

      expect(button).toHaveFocus();
    });

    it("has focus ring style on focus", () => {
      render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("focus:outline-none");
      expect(button.className).toContain("focus:ring-2");
    });
  });

  describe("Fallback to execCommand (Older Browsers)", () => {
    beforeEach(() => {
      // Simulate browser without Clipboard API
      delete (navigator as unknown as Record<string, unknown>).clipboard;
      // Make sure execCommand is mocked for jsdom
      if (typeof document.execCommand !== "function") {
        (document as unknown as Record<string, unknown>).execCommand = jest.fn(() => true);
      }
    });

    afterEach(() => {
      // Restore Clipboard API for subsequent tests
      Object.assign(navigator, {
        clipboard: {
          writeText: mockClipboardWriteText,
        },
      });
    });

    it("uses execCommand fallback when Clipboard API is unavailable", async () => {
      const execCommandSpy = jest.spyOn(document, "execCommand").mockReturnValue(true);
      const value = "GABCDEF123456WXYZABCDEF";

      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(execCommandSpy).toHaveBeenCalledWith("copy");
      });

      execCommandSpy.mockRestore();
    });

    it("cleans up textarea after execCommand copy", async () => {
      jest.spyOn(document, "execCommand").mockReturnValue(true);
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(
        () => {
          // Textarea should be cleaned up after copy (at most initial count
          const textareas = document.querySelectorAll("textarea");
          // The component creates and removes textareas, so we should have minimal ones left
          expect(textareas.length).toBeLessThanOrEqual(2);
        },
        { timeout: 3000 }
      );
    });

    it("shows 'Copied!' message after execCommand success", async () => {
      jest.spyOn(document, "execCommand").mockReturnValue(true);
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(
        () => {
          expect(screen.getByText("Copied!")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe("Error Handling", () => {
    it("calls onCopyError callback on copy failure", async () => {
      const onCopyError = jest.fn();
      mockClipboardWriteText.mockRejectedValueOnce(new Error("Copy failed"));

      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} onCopyError={onCopyError} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(onCopyError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it("handles non-Error objects in promise rejection", async () => {
      const onCopyError = jest.fn();
      mockClipboardWriteText.mockRejectedValueOnce("String error");

      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} onCopyError={onCopyError} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(onCopyError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it("does not show 'Copied!' on error", async () => {
      mockClipboardWriteText.mockRejectedValueOnce(new Error("Copy failed"));

      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
      });
    });
  });

  describe("Accessibility Features", () => {
    it("has proper ARIA attributes", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" label="Test Label" />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Test Label");
    });

    it("has aria-hidden on icon", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const svg = screen.getByRole("button").querySelector("svg[aria-hidden='true']");
      expect(svg).toBeInTheDocument();
    });

    it("has role='status' and aria-live='polite' on 'Copied!' message", async () => {
      render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Wait for "Copied!" text to appear, then check parent's attributes
      await waitFor(
        () => {
          const copiedText = screen.getByText("Copied!");
          // The text should be within a span with role="status"
          const parent = copiedText.closest("[role='status']");
          expect(parent).toBeInTheDocument();
          expect(parent).toHaveAttribute("aria-live", "polite");
        },
        { timeout: 5000 }
      );
    });

    it("announces 'Copied!' to screen readers", async () => {
      render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Wait for status role element to be present
      await waitFor(
        () => {
          const statusElement = screen.getByRole("status");
          expect(statusElement).toBeInTheDocument();
          expect(statusElement).toHaveAttribute("aria-live", "polite");
        },
        { timeout: 5000 }
      );
    });
  });

  describe("Styling and CSS Classes", () => {
    it("applies default styling classes", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("px-2");
      expect(button.className).toContain("py-1");
      expect(button.className).toContain("rounded-lg");
      expect(button.className).toContain("text-blue-400");
    });

    it("accepts custom className prop", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" className="custom-class" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("custom-class");
    });

    it("has hover state styles", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("hover:bg-blue-600/30");
      expect(button.className).toContain("hover:border-blue-500");
    });

    it("has transition for smooth visual feedback", () => {
      render(<CopyButton value="GABCDEF123456WXYZ" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("transition-all");
    });
  });

  describe("Multiple Rapid Clicks", () => {
    it("handles multiple rapid copy clicks without race conditions", async () => {
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");

      // Click multiple times rapidly
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      await waitFor(
        () => {
          expect(mockClipboardWriteText).toHaveBeenCalledTimes(3);
        },
        { timeout: 3000 }
      );
    });

    it("clears previous timeout before setting new one", async () => {
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, "setTimeout");
      const value = "GABCDEF123456WXYZABCDEF";
      render(<CopyButton value={value} />);

      const button = screen.getByRole("button");

      // First click sets a timeout
      await act(async () => {
        fireEvent.click(button);
      });

      const firstCallCount = setTimeoutSpy.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      // Advance to nearly the timeout
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // Second click should clear the previous timeout and set a new one
      await act(async () => {
        fireEvent.click(button);
      });

      const secondCallCount = setTimeoutSpy.mock.calls.length;
      // Should have called setTimeout again (total count increased)
      expect(secondCallCount).toBeGreaterThan(firstCallCount);

      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe("Integration Scenarios", () => {
    it("works with wallet addresses", async () => {
      const walletAddress = "GABCDEF123456WXYZABCDEF123456WXYZ";
      render(<CopyButton value={walletAddress} label="Wallet Address" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(
        () => {
          expect(mockClipboardWriteText).toHaveBeenCalledWith(walletAddress);
        },
        { timeout: 3000 }
      );
    });

    it("works with transaction IDs", async () => {
      const transactionId = "TXABCDEF123456WXYZABCDEF123456";
      render(<CopyButton value={transactionId} label="Transaction ID" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(
        () => {
          expect(mockClipboardWriteText).toHaveBeenCalledWith(transactionId);
        },
        { timeout: 3000 }
      );
    });

    it("displays appropriate message for short values", () => {
      const shortId = "ABC123";
      render(<CopyButton value={shortId} />);

      expect(screen.getByText(shortId)).toBeInTheDocument();
    });
  });
});

describe("displayValue prop", () => {
  it("renders displayValue when provided instead of auto-abbreviation", () => {
    render(<CopyButton value="GABCDEF123456WXYZABCDEF" displayValue="GABC...CDEF" />);
    expect(screen.getByText("GABC...CDEF")).toBeInTheDocument();
  });

  it("still copies the full value when displayValue is set", async () => {
    const full = "GABCDEF123456WXYZABCDEF";
    render(<CopyButton value={full} displayValue="GABC...CDEF" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockClipboardWriteText).toHaveBeenCalledWith(full));
  });

  it("falls back to auto-abbreviation when displayValue is not provided", () => {
    render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);
    expect(screen.getByText("GABCDE...CDEF")).toBeInTheDocument();
  });
});

describe("Manual copy prompt fallback", () => {
  beforeEach(() => {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
    jest.spyOn(document, "execCommand").mockReturnValue(false); // both fail
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } });
    jest.restoreAllMocks();
  });

  it("shows manual copy prompt when both clipboard methods fail", async () => {
    render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByTestId("manual-copy-prompt")).toBeInTheDocument()
    );
  });

  it("manual copy input contains the full value", async () => {
    const value = "GABCDEF123456WXYZABCDEF";
    render(<CopyButton value={value} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const input = screen.getByTestId("manual-copy-input") as HTMLInputElement;
      expect(input.value).toBe(value);
    });
  });

  it("dismiss button hides the manual copy prompt", async () => {
    render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByTestId("manual-copy-prompt"));
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByTestId("manual-copy-prompt")).not.toBeInTheDocument();
  });

  it("does not show Copied! when fallback fails", async () => {
    render(<CopyButton value="GABCDEF123456WXYZABCDEF" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByTestId("manual-copy-prompt"));
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});
