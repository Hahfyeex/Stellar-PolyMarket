/**
 * oracles/price.js — Price feed oracle (crypto / economics markets)
 *
 * Fetches the current price of an asset from CoinGecko and compares it
 * against the market question to determine the winning outcome.
 *
 * Expected market question format:
 *   "Will BTC reach $100000 before <date>?"
 *   outcomes: ["Yes", "No"]
 *
 * The oracle extracts the target price from the question, fetches the
 * current price, and returns outcome index 0 ("Yes") if the price has
 * been reached, or 1 ("No") otherwise.
 */

const axios = require('axios');

const COINGECKO_BASE = process.env.COINGECKO_URL || 'https://api.coingecko.com/api/v3';

// Map common ticker symbols to CoinGecko IDs
const COIN_MAP = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XLM: 'stellar',
  SOL: 'solana',
};

/**
 * Extract coin symbol and target price from a market question.
 * Returns null if the question doesn't match the expected format.
 */
function parseQuestion(question) {
  // Match "Will <TICKER> ..." with a dollar amount anywhere in the question.
  // Two separate captures: ticker after "Will", price anywhere with "$".
  const tickerMatch = question.match(/Will\s+([A-Z]{2,5})\b/i);
  const priceMatch = question.match(/\$([0-9,]+)/);
  if (!tickerMatch || !priceMatch) return null;
  return {
    symbol: tickerMatch[1].toUpperCase(),
    targetPrice: parseFloat(priceMatch[1].replace(/,/g, '')),
  };
}

/**
 * Resolve a price-based market.
 * @param {object} market
 * @returns {Promise<number>} 0 if target reached, 1 if not
 */
async function resolve(market) {
  const parsed = parseQuestion(market.question);
  if (!parsed) {
    throw new Error(`Cannot parse price target from question: "${market.question}"`);
  }

  const coinId = COIN_MAP[parsed.symbol];
  if (!coinId) {
    throw new Error(`Unknown coin symbol: ${parsed.symbol}`);
  }

  const { data } = await axios.get(`${COINGECKO_BASE}/simple/price`, {
    params: { ids: coinId, vs_currencies: 'usd' },
    timeout: 5000,
  });

  const currentPrice = data[coinId]?.usd;
  if (currentPrice == null) {
    throw new Error(`No price data returned for ${coinId}`);
  }

  // outcome 0 = "Yes" (target reached), outcome 1 = "No"
  return currentPrice >= parsed.targetPrice ? 0 : 1;
}

module.exports = { resolve, parseQuestion };
