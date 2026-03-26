"use client";
/**
 * SlippageSettings
 *
 * 4 preset buttons (0.5%, 1%, 2%, custom) + a custom number input.
 * Persists the selected tolerance to localStorage key "stella_slippage_pref"
 * so it restores on the next visit.
 */
import { useState, useEffect } from "react";

const STORAGE_KEY = "stella_slippage_pref";
const PRESETS = [0.5, 1, 2] as const;

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function SlippageSettings({ value, onChange }: Props) {
  const [customMode, setCustomMode] = useState(() => !PRESETS.includes(value as any));
  const [customInput, setCustomInput] = useState(String(value));

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseFloat(stored);
        if (isFinite(parsed) && parsed > 0) {
          onChange(parsed);
          setCustomInput(String(parsed));
          setCustomMode(!PRESETS.includes(parsed as any));
        }
      }
    } catch {
      // localStorage unavailable — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(v: number) {
    setCustomMode(false);
    persist(v);
    onChange(v);
  }

  function handleCustomChange(raw: string) {
    setCustomInput(raw);
    const parsed = parseFloat(raw);
    if (isFinite(parsed) && parsed > 0 && parsed <= 50) {
      persist(parsed);
      onChange(parsed);
    }
  }

  function persist(v: number) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="slippage-settings">
      <span className="text-xs text-gray-400 mr-1">Slippage</span>

      {/* Preset buttons */}
      {PRESETS.map((p) => (
        <button
          key={p}
          data-testid={`slippage-preset-${p}`}
          onClick={() => select(p)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
            ${!customMode && value === p
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
        >
          {p}%
        </button>
      ))}

      {/* Custom button */}
      <button
        data-testid="slippage-preset-custom"
        onClick={() => setCustomMode(true)}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
          ${customMode ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
      >
        Custom
      </button>

      {/* Custom input — shown only in custom mode */}
      {customMode && (
        <input
          data-testid="slippage-custom-input"
          type="number"
          min={0.01}
          max={50}
          step={0.1}
          value={customInput}
          onChange={(e) => handleCustomChange(e.target.value)}
          className="w-16 bg-gray-800 text-white rounded-lg px-2 py-1 text-xs border border-gray-700 outline-none focus:border-blue-500"
          aria-label="Custom slippage tolerance"
        />
      )}

      <span className="text-xs text-gray-500">tolerance</span>
    </div>
  );
}
