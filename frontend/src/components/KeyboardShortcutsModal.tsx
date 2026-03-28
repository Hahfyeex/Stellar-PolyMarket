"use client";
/**
 * KeyboardShortcutsModal — Issue #484
 *
 * Displays all registered keyboard shortcuts in a two-column layout.
 * Opened by pressing "?" anywhere in the app.
 */
import React from "react";

const SHORTCUTS: { key: string; action: string }[] = [
  { key: "B", action: "Open bet form" },
  { key: "/", action: "Focus search" },
  { key: "Esc", action: "Close modal / dropdown" },
  { key: "?", action: "Show keyboard shortcuts" },
];

interface Props {
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">Keyboard Shortcuts</h2>
          <button
            data-testid="shortcuts-modal-close"
            onClick={onClose}
            aria-label="Close shortcuts modal"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Two-column shortcut list */}
        <div className="space-y-2">
          {SHORTCUTS.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <kbd
                data-testid={`shortcut-key-${key}`}
                className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-200"
              >
                {key}
              </kbd>
              <span className="text-gray-300 text-sm">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
