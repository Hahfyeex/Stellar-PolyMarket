"use client";
import { useEffect, useCallback } from "react";

export interface ShortcutHandlers {
  onOpenBetForm?: () => void;
  onFocusSearch?: () => void;
  onCloseModal?: () => void;
  onOpenHelp?: () => void;
}

/** Returns true when the user is actively typing in a form field. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
    el.getAttribute("contenteditable") === "true" ||
    el.isContentEditable === true;
}

/**
 * useKeyboardShortcuts — Issue #484
 *
 * Registers global keydown shortcuts:
 *   B          → open bet form
 *   /          → focus search input
 *   Escape     → close open modal / dropdown
 *   ?          → open keyboard shortcuts help modal
 *
 * Guards against firing while the user is typing in any input field.
 * Cleans up listeners on unmount.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const handle = useCallback(
    (e: KeyboardEvent) => {
      if (isTyping()) return;

      switch (e.key) {
        case "b":
        case "B":
          handlers.onOpenBetForm?.();
          break;
        case "/":
          e.preventDefault(); // prevent browser quick-find
          handlers.onFocusSearch?.();
          break;
        case "Escape":
          handlers.onCloseModal?.();
          break;
        case "?":
          handlers.onOpenHelp?.();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlers.onOpenBetForm, handlers.onFocusSearch, handlers.onCloseModal, handlers.onOpenHelp]
  );

  useEffect(() => {
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [handle]);
}
