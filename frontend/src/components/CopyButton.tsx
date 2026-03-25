"use client";

import { useRef, useState } from "react";

/**
 * CopyButton Component
 *
 * A reusable copy-to-clipboard button that displays an abbreviated value
 * (first 6 + last 4 characters) and copies the full value on click.
 *
 * Features:
 * - Displays abbreviated format: "ABCDEF...WXYZ"
 * - Copies full value to clipboard via Clipboard API
 * - Graceful fallback for older browsers (textarea + execCommand)
 * - "Copied!" tooltip that auto-dismisses after 2 seconds
 * - Full keyboard accessibility (Enter/Space support)
 * - ARIA labels for screen readers
 *
 * Usage:
 * ```tsx
 * <CopyButton value="GABCDEF123456WXYZ" label="Wallet Address" />
 * ```
 */

interface Props {
  /**
   * The full value to copy to clipboard
   * Example: "GABCDEF123456WXYZABCDEF123456WXYZ"
   */
  value: string;

  /**
   * Display label for accessibility (aria-label)
   * Example: "Wallet Address", "Transaction ID"
   * If not provided, defaults to "Copy to clipboard"
   */
  label?: string;

  /**
   * Optional CSS class for styling
   * Applied to the button element
   */
  className?: string;

  /**
   * Optional callback when copy succeeds
   */
  onCopySuccess?: () => void;

  /**
   * Optional callback when copy fails
   */
  onCopyError?: (error: Error) => void;
}

/**
 * Abbreviates a value to first 6 + last 4 characters
 * Example: "GABCDEF123456WXYZABCDEF" → "GABCDE...WXYZ"
 *
 * If value is shorter than 11 characters, returns the full value.
 */
function abbreviateValue(value: string): string {
  if (!value || value.length < 11) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function CopyButton({
  value,
  label = "Copy to clipboard",
  className = "",
  onCopySuccess,
  onCopyError,
}: Props) {
  // Track whether the "Copied!" message is showing
  const [copied, setCopied] = useState(false);

  // Timer reference for clearing the "Copied!" tooltip timeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Attempts to copy the value to clipboard using the Clipboard API.
   * Falls back to the older execCommand method if Clipboard API is unavailable.
   *
   * The Clipboard API approach:
   * - Modern, promise-based API
   * - Works in all modern browsers
   * - Secure (user interaction required, no access to arbitrary clipboard data)
   *
   * Fallback approach (for older browsers):
   * - Create a hidden textarea
   * - Set its value to the text to copy
   * - Select the text
   * - Call document.execCommand('copy')
   * - Clean up the textarea
   */
  async function handleCopy() {
    try {
      // Try the modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for older browsers (IE 11, older Safari, etc.)
        copyUsingExecCommand(value);
      }

      // Show the "Copied!" tooltip
      setCopied(true);

      // Clear any existing timeout to prevent race conditions
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Auto-hide "Copied!" message after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);

      // Call optional success callback
      onCopySuccess?.();
    } catch (error) {
      // Call optional error callback
      const err = error instanceof Error ? error : new Error("Failed to copy");
      onCopyError?.(err);
    }
  }

  /**
   * Fallback copy method using the deprecated execCommand API.
   * Used for browsers that don't support the modern Clipboard API.
   *
   * How it works:
   * 1. Create a hidden textarea element
   * 2. Set its value to the text we want to copy
   * 3. Append it to the document
   * 4. Select all text in the textarea
   * 5. Execute the document 'copy' command
   * 6. Remove the textarea from the document
   *
   * This approach is deprecated but still widely supported for backwards compatibility.
   */
  function copyUsingExecCommand(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Hide the textarea off-screen
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);

    // Select the text and copy
    textarea.select();
    const success = document.execCommand("copy");

    // Clean up
    document.body.removeChild(textarea);

    if (!success) {
      throw new Error("execCommand copy failed");
    }
  }

  /**
   * Handle keyboard events (Enter and Space should trigger copy)
   * This ensures the button is keyboard accessible
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  }

  return (
    <div className="relative inline-block">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        onKeyDown={handleKeyDown}
        // Accessibility attributes
        aria-label={label}
        title={value} // Show full value in tooltip on hover
        // Styling
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 
          rounded-lg text-sm font-mono text-blue-400
          bg-blue-600/20 hover:bg-blue-600/30 
          border border-blue-500/50 hover:border-blue-500
          transition-all duration-200 
          cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-800
          ${className}
        `}
        type="button"
      >
        {/* Copy icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
          <path d="M15 2H9a1 1 0 00-1 1v4h8V3a1 1 0 00-1-1z" />
        </svg>

        {/* Abbreviated value or "Copied!" message */}
        <span className={`transition-all duration-200 ${copied ? "opacity-0" : "opacity-100"}`}>
          {abbreviateValue(value)}
        </span>

        {/* "Copied!" tooltip that fades in when copy succeeds */}
        {copied && (
          <span
            className="absolute inset-0 flex items-center justify-center text-green-400 font-semibold animate-pulse"
            role="status"
            aria-live="polite"
          >
            Copied!
          </span>
        )}
      </button>
    </div>
  );
}
