/**
 * BetForm — Reusable components for bet inputs.
 * Memoized to prevent re-renders when parent states change unnecessarily.
 */
import React, { useCallback, memo } from "react";

interface BetFormProps {
  amount: string;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  loading: boolean;
  buttonLabel?: string;
}

export const BetForm = memo(function BetForm({
  amount,
  onAmountChange,
  onSubmit,
  disabled,
  loading,
  buttonLabel = "Bet",
}: BetFormProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onAmountChange(e.target.value);
    },
    [onAmountChange]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
    [onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="number"
        placeholder="Amount (XLM)"
        value={amount}
        onChange={handleChange}
        className="bg-gray-800 text-white rounded-lg px-3 py-2 flex-1 border border-gray-700 focus:border-blue-500 outline-none transition-colors"
      />
      <button
        type="submit"
        disabled={disabled || loading}
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
      >
        {loading ? "Placing..." : buttonLabel}
      </button>
    </form>
  );
});

BetForm.displayName = "BetForm";
export default BetForm;
