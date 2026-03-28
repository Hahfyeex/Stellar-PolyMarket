/**
 * Configurable preset stake amounts (XLM).
 * Update these values to change the preset buttons without touching component code.
 * 
 * Issue #508: Quick-select presets for faster bet placement
 * - 10, 50, 100, 500 XLM presets
 * - Max button calculates available balance minus gas buffer
 * - Active preset highlighted with brand color
 * - Typing custom amount deselects all presets
 */
export const BET_PRESETS: readonly number[] = [10, 50, 100, 500] as const;

/**
 * XLM reserved for transaction fees so the "Max" preset never drains the wallet.
 * Issue #508: 0.5 XLM gas buffer for safe max bet calculation
 */
export const GAS_BUFFER_XLM = 0.5;

/**
 * Calculates the maximum bettable amount given a raw XLM balance string.
 * Returns 0 if the balance is less than or equal to the gas buffer.
 */
export function calcMaxBet(balanceXlm: string | number): number {
  const balance = typeof balanceXlm === "string" ? parseFloat(balanceXlm) : balanceXlm;
  if (isNaN(balance)) return 0;
  return Math.max(0, balance - GAS_BUFFER_XLM);
}
