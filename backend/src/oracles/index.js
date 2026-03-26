/**
 * oracles/index.js
 *
 * Oracle registry — maps market categories to resolver functions.
 * Each resolver receives a market row and returns the winning outcome index (0-based),
 * or throws if the result cannot be determined.
 *
 * To add a new oracle type:
 *   1. Create a file in this directory (e.g. oracles/football.js)
 *   2. Export an async resolve(market) function that returns a number
 *   3. Register it below with the matching category string
 */

const priceOracle = require('./price');
const sportsOracle = require('./sports');

// Category → resolver mapping.
// Falls back to null if category is unrecognised — caller handles the error.
const REGISTRY = {
  crypto: priceOracle,
  economics: priceOracle,
  sports: sportsOracle,
  football: sportsOracle,
};

/**
 * Resolve a market using the appropriate oracle.
 * @param {object} market - DB row from the markets table
 * @returns {Promise<number>} winning outcome index
 * @throws if no oracle is registered for the market's category
 */
async function resolveMarket(market) {
  const category = (market.category || 'general').toLowerCase();
  const oracle = REGISTRY[category];
  if (!oracle) {
    throw new Error(`No oracle registered for category: ${category}`);
  }
  return oracle.resolve(market);
}

module.exports = { resolveMarket, REGISTRY };
