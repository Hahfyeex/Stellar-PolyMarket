"use client";
/**
 * KeyboardShortcutsProvider — Issue #484
 *
 * Thin client wrapper that mounts the global keyboard shortcuts hook
 * and renders the help modal. Placed inside the root layout so shortcuts
 * are available on every page.
 *
 * Page-level shortcuts (B = open bet form, / = focus search) are handled
 * by dispatching custom events that individual pages can listen to.
 */
import { useState, useCallback } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";

export default function KeyboardShortcutsProvider() {
  const [helpOpen, setHelpOpen] = useState(false);

  const onOpenBetForm = useCallback(() => {
    window.dispatchEvent(new CustomEvent("kb:openBetForm"));
  }, []);

  const onFocusSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent("kb:focusSearch"));
  }, []);

  const onCloseModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent("kb:closeModal"));
  }, []);

  const onOpenHelp = useCallback(() => setHelpOpen(true), []);

  useKeyboardShortcuts({ onOpenBetForm, onFocusSearch, onCloseModal, onOpenHelp });

  return helpOpen ? <KeyboardShortcutsModal onClose={() => setHelpOpen(false)} /> : null;
}
