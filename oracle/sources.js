"use strict";

/**
 * Oracle source fetchers for BTC/USD price.
 *
 * Each export is a zero-argument async function that resolves to a number
 * (the BTC price in USD) or rejects on failure.
 *
 * Adding a new source:
 *  1. Write an async function that returns a finite number.
 *  2. Export it and add it to the `btcSources` array at the bottom.
 *  3. No other changes needed — the medianizer picks it up automatically.
 */

const axios = require("axios");

/** Source 1: CoinGecko — free, no API key required */
async function fetchCoinGecko() {
  const { data } = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { timeout: 5000 }
  );
  return data.bitcoin.usd;
}

/** Source 2: Binance public ticker */
async function fetchBinance() {
  const { data } = await axios.get(
    "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    { timeout: 5000 }
  );
  return parseFloat(data.price);
}

/** Source 3: Coinbase public price endpoint */
async function fetchCoinbase() {
  const { data } = await axios.get(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    { timeout: 5000 }
  );
  return parseFloat(data.data.amount);
}

/** Source 4: Kraken public ticker */
async function fetchKraken() {
  const { data } = await axios.get(
    "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    { timeout: 5000 }
  );
  // Kraken returns last trade price as first element of 'c' array
  return parseFloat(data.result.XXBTZUSD.c[0]);
}

/** All BTC/USD sources — add new fetchers here */
const btcSources = [fetchCoinGecko, fetchBinance, fetchCoinbase, fetchKraken];

module.exports = { btcSources, fetchCoinGecko, fetchBinance, fetchCoinbase, fetchKraken };
