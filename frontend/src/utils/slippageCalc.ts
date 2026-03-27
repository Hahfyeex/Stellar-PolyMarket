/**
 * slippageCalc.ts
 *
 * All payout and slippage calculations use BigInt arithmetic to avoid
 * floating-point rounding errors inherent in XLM's 7-decimal precision.
 *
 * Representation convention:
 *   All XLM amounts are scaled by 1e7 (Stellar's stroop unit) before
 *   converting to BigInt, so 1.5 XLM → BigInt(15_000_000).
 *
 * Slippage formula:
 *   expectedPayout = (stake / (outcomePool + stake)) * totalPool * 0.97
 *   currentPayout  = same formula with updated pool values
 *   drift          = (expectedPayout - currentPayout) / expectedPayout
 *   exceeded       = drift > tolerance
 */

/** Scale factor: 1 XLM = 10^7 stroops */
const SCALE = 1_000_0000n; // 1e7 as BigInt

/**
 * Convert a floating-point XLM amount to a BigInt stroop value.
 * Math.round avoids truncation errors at the 7th decimal place.
 */
export function toStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 1e7));
}

/**
 * Calculate projected payout in stroops using pure BigInt arithmetic.
 *
 * Formula (integer version):
 *   share_num   = stake
 *   share_denom = outcomePool + stake
 *   payout      = (stake * totalPool * 97) / (share_denom * 100)
 *
 * The 0.97 fee multiplier is expressed as 97/100 to stay in integer domain.
 *
 * @param stakeStroops       - Stake amount in stroops
 * @param outcomePoolStroops - Current outcome pool in stroops
 * @param totalPoolStroops   - Total pool across all outcomes in stroops
 * @returns Projected payout in stroops (0n if inputs are invalid)
 */
export function calcPayoutStroops(
  stakeStroops: bigint,
  outcomePoolStroops: bigint,
  totalPoolStroops: bigint
): bigint {
  // Guard: reject zero or negative inputs
  if (stakeStroops <= 0n || totalPoolStroops <= 0n || outcomePoolStroops < 0n) {
    return 0n;
  }

  const denom = outcomePoolStroops + stakeStroops;

  // (stake * totalPool * 97) / (denom * 100)
  // Multiply before dividing to preserve precision in integer arithmetic
  return (stakeStroops * totalPoolStroops * 97n) / (denom * 100n);
}

/**
 * Check whether the slippage between an expected payout and a current payout
 * exceeds the user's tolerance threshold.
 *
 * Both tolerance and drift are expressed as percentages (e.g. 0.5 = 0.5%).
 *
 * BigInt comparison:
 *   drift_bps = (expected - current) * 10_000 / expected   (basis points × 100)
 *   tolerance_bps = tolerance * 100 * 100                  (same scale)
 *   exceeded = drift_bps > tolerance_bps
 *
 * @param expectedPayoutStroops - Payout calculated at bet-form-open time
 * @param currentPayoutStroops  - Payout calculated just before submission
 * @param tolerancePct          - User's slippage tolerance in percent (e.g. 0.5)
 * @returns true if slippage exceeds tolerance
 */
export function isSlippageExceeded(
  expectedPayoutStroops: bigint,
  currentPayoutStroops: bigint,
  tolerancePct: number
): boolean {
  // No slippage possible if expected is zero
  if (expectedPayoutStroops <= 0n) return false;

  // Payout improved or unchanged — never a problem
  if (currentPayoutStroops >= expectedPayoutStroops) return false;

  const drift = expectedPayoutStroops - currentPayoutStroops;

  // Scale both sides by 1e7 to compare without floats.
  // drift_scaled = drift * 1e7 / expected
  // tolerance_scaled = tolerance * 1e7 / 100  (convert % to ratio)
  const driftScaled = drift * SCALE;
  const toleranceScaled = BigInt(Math.round(tolerancePct * 1e7)) * expectedPayoutStroops / 100n;

  return driftScaled > toleranceScaled;
}

/**
 * Convert a stroop BigInt back to a human-readable XLM float (for display only).
 * Never use this result in further BigInt calculations.
 */
export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / 1e7;
}
