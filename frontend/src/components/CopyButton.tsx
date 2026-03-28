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
  /** The full value to copy to clipboard */
  value: string;

  /**
   * Optional pre-formatted display string.
   * If omitted, auto-abbreviates to first 6 + "..." + last 4 chars.
   */
  displayValue?: string;

  /** Accessible label. Defaults to "Copy to clipboard" */
  label?: string;

  /** Extra CSS classes applied to the button */
  className?: string;

  /** Called when copy succeeds */
  onCopySuccess?: () => void;

  /** Called when copy fails */
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
  displayValue,
  label = "Copy to clipboard",
  className = "",
  onCopySuccess,
  onCopyError,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showManualPrompt, setShowManualPrompt] = useState(false);
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
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        copyUsingExecCommand(value);
      }

      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      onCopySuccess?.();
    } catch (error) {
      // Both methods failed — show manual copy prompt
      setShowManualPrompt(true);
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
        aria-label={label}
        title={value}
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

        <span className={`transition-all duration-200 ${copied ? "opacity-0" : "opacity-100"}`}>
          {displayValue ?? abbreviateValue(value)}
        </span>

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

      {/* Manual copy prompt — shown when both Clipboard API and execCommand fail */}
      {showManualPrompt && (
        <div
          data-testid="manual-copy-prompt"
          role="dialog"
          aria-label="Manual copy"
          className="absolute z-50 top-full left-0 mt-1 p-2 rounded-lg text-xs w-56"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          <p className="mb-1" style={{ color: "var(--text-primary)" }}>Copy manually:</p>
          <input
            data-testid="manual-copy-input"
            readOnly
            value={value}
            onFocus={(e) => e.target.select()}
            className="w-full px-1.5 py-1 rounded text-xs font-mono"
            style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
            aria-label="Value to copy manually"
          />
          <button
            className="mt-1 text-xs underline"
            style={{ color: "var(--accent-primary-text)" }}
            onClick={() => setShowManualPrompt(false)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
