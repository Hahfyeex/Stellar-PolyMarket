/**
 * Volume-Weighted Average Price (VWAP) calculator for position tokens.
 *
 * VWAP = Σ(price_i × volume_i) / Σ(volume_i)
 *
 * Each trade (Mint or Burn event) contributes its price weighted by the
 * number of tokens exchanged. This gives a fair market value that is not
 * skewed by outlier low-volume trades.
 */

/**
 * @typedef {Object} Trade
 * @property {number|string} price_xlm  - Price per token in XLM
 * @property {number|string} volume     - Number of tokens in this trade
 */

/**
 * Calculate the Volume-Weighted Average Price from an array of trades.
 *
 * @param {Trade[]} trades - Array of trade objects with price_xlm and volume
 * @returns {number} VWAP in XLM, or 0 if no trades / zero total volume
 */
function calculateVWAP(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return 0;

  let sumPriceVolume = 0;
  let sumVolume = 0;

  for (const trade of trades) {
    const price = parseFloat(trade.price_xlm);
    const volume = parseFloat(trade.volume);

    // Skip malformed or non-positive entries
    if (!isFinite(price) || !isFinite(volume) || volume <= 0 || price < 0) {
      continue;
    }

    sumPriceVolume += price * volume;
    sumVolume += volume;
  }

  if (sumVolume === 0) return 0;

  // Round to 7 decimal places (1 stroop precision)
  return Math.round((sumPriceVolume / sumVolume) * 1e7) / 1e7;
}

module.exports = { calculateVWAP };
