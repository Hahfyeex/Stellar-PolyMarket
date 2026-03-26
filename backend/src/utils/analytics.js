/**
 * Wisdom of the Crowd Analytics
 * Calculates a Confidence Score (0-100) based on:
 * 1. User Diversity (Unique Bettors)
 * 2. Stake Distribution (Gini Coefficient / Concentration)
 * 
 * High diversity + Low concentration = High Confidence
 */

/**
 * Calculates the Gini coefficient of a distribution.
 * 0 = Perfect equality (even spread of bets)
 * 1 = Perfect inequality (one whale holds everything)
 * @param {number[]} values - Array of bet amounts
 * @returns {number} Gini coefficient
 */
function calculateGiniCoefficient(values) {
  if (values.length === 0) return 0;
  if (values.length === 1) return 1;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (i + 1) * sorted[i];
  }

  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;

  return (2 * sum) / (n * n * mean) - (n + 1) / n;
}

/**
 * Calculates the Confidence Score for a market.
 * @param {Object[]} bets - List of bets for the market
 * @returns {number} Score between 0 and 100
 */
function calculateConfidenceScore(bets) {
  if (!bets || bets.length === 0) return 0;

  // 1. Unique Bettors
  const uniqueWallets = new Set(bets.map(b => b.wallet_address));
  const uniqueCount = uniqueWallets.size;

  // 2. Diversity Score (Logarithmic scaling, reaches 90% at ~20 unique bettors)
  const diversityFactor = Math.min(uniqueCount / (uniqueCount + 5), 1);

  // 3. Concentration Score (Equity)
  // Group bets by wallet to see if one person owns most of the pool
  const walletBets = bets.reduce((acc, b) => {
    acc[b.wallet_address] = (acc[b.wallet_address] || 0) + parseFloat(b.amount);
    return acc;
  }, {});
  const stakes = Object.values(walletBets);
  const gini = calculateGiniCoefficient(stakes);
  const equityFactor = 1 - gini;

  // 4. Volume Bonus (Small bonus for total bets count)
  const volumeBonus = Math.min(bets.length / 100, 0.1); 

  // Combined score: 45% Diversity, 45% Equity, 10% Volume
  const rawScore = (diversityFactor * 0.45 + equityFactor * 0.45 + volumeBonus) * 100;

  return Math.min(Math.round(rawScore), 100);
}

module.exports = {
  calculateGiniCoefficient,
  calculateConfidenceScore
};
