"use client";
/**
 * StakePresets
 *
 * Renders quick-select preset buttons below a stake input.
 * Clicking a preset fills the input; typing a custom value deselects all presets.
 * The "Max" button calculates available balance minus a gas buffer.
 *
 * Usage:
 *   <StakePresets amount={amount} onSelect={setAmount} walletBalance="120.50" />
 */
import React from "react";
import { BET_PRESETS, calcMaxBet } from "../constants/betPresets";

interface Props {
  /** Current value of the stake input (controlled). */
  amount: string;
  /** Called with the new amount string when a preset is clicked. */
  onSelect: (value: string) => void;
  /** Raw XLM balance string from the wallet (e.g. "120.50"). Null hides Max button. */
  walletBalance: string | null;
  /** Whether the input is disabled (e.g. wallet not connected). */
  disabled?: boolean;
}

export default function StakePresets({ amount, onSelect, walletBalance, disabled = false }: Props) {
  const maxBet = walletBalance !== null ? calcMaxBet(walletBalance) : null;

  /** Returns true when this preset value matches the current input exactly. */
  function isActive(value: number): boolean {
    return amount === String(value);
  }

  function isMaxActive(): boolean {
    return maxBet !== null && amount === String(maxBet);
  }

  const baseClass =
    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border " +
    "disabled:opacity-40 disabled:cursor-not-allowed ";
  const activeClass = "bg-blue-600 border-blue-500 text-white";
  const inactiveClass = "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white";

  return (
    <div data-testid="stake-presets" className="flex gap-2 flex-wrap">
      {BET_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          data-testid={`preset-${preset}`}
          disabled={disabled}
          onClick={() => onSelect(String(preset))}
          className={`${baseClass} ${isActive(preset) ? activeClass : inactiveClass}`}
        >
          {preset} XLM
        </button>
      ))}

      {maxBet !== null && (
        <button
          type="button"
          data-testid="preset-max"
          disabled={disabled || maxBet <= 0}
          onClick={() => onSelect(String(maxBet))}
          className={`${baseClass} ${isMaxActive() ? activeClass : inactiveClass}`}
        >
          Max
        </button>
      )}
    </div>
  );
}
