/**
 * WhatIfSimulator calculation utilities
 *
 * Formula reference:
 *   projectedPayout = (stakeAmount / (poolForOutcome + stakeAmount)) * totalPool * 0.97
 *
 * Explanation:
 *   - stakeAmount / (poolForOutcome + stakeAmount)  → your share of the outcome pool after your bet
 *   - * totalPool                                   → your share of the entire prize pool
 *   - * 0.97                                        → 3% platform fee deducted
 *
 * Implied probability:
 *   impliedProbability = (poolForOutcome / totalPool) * 100
 *   Represents the market's current consensus probability for the chosen outcome.
 */

export interface SimulatorResult {
  /** Projected payout if the chosen outcome wins (after 3% fee) */
  projectedPayout: number;
  /** Net profit/loss: projectedPayout - stakeAmount */
  projectedProfit: number;
  /** Market-implied probability for the chosen outcome (0–100) */
  impliedProbability: number;
}

/**
 * Calculate projected payout, profit, and implied probability.
 *
 * @param stakeAmount   - Amount the user wants to bet (XLM)
 * @param poolForOutcome - Current pool size for the chosen outcome (XLM)
 * @param totalPool     - Total pool across all outcomes (XLM)
 * @returns SimulatorResult with payout, profit, and implied probability
 */
export function calculateSimulator(
  stakeAmount: number,
  poolForOutcome: number,
  totalPool: number
): SimulatorResult {
  // Guard: invalid inputs return zeroed result
  if (
    stakeAmount <= 0 ||
    poolForOutcome < 0 ||
    totalPool <= 0 ||
    !isFinite(stakeAmount) ||
    !isFinite(poolForOutcome) ||
    !isFinite(totalPool)
  ) {
    return { projectedPayout: 0, projectedProfit: 0, impliedProbability: 0 };
  }

  // Your share of the outcome pool after adding your stake
  const outcomeShare = stakeAmount / (poolForOutcome + stakeAmount);

  // Projected payout = your share of total pool, minus 3% fee
  const projectedPayout = outcomeShare * totalPool * 0.97;

  // Net P&L
  const projectedProfit = projectedPayout - stakeAmount;

  // Implied probability: current pool ratio before your bet
  const impliedProbability = (poolForOutcome / totalPool) * 100;

  return {
    projectedPayout: Math.max(0, projectedPayout),
    projectedProfit,
    impliedProbability: Math.min(100, Math.max(0, impliedProbability)),
  };
}
