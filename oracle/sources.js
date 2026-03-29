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
 *
 * Auth Enforcement:
 *   API keys MUST be stored in environment variables only.
 *   Never hard-code keys in this file.
 */

const axios = require("axios");

/** Thrown when CoinGecko returns HTTP 429 — caller should retry after `retryAfter` seconds */
class RateLimitError extends Error {
  constructor(retryAfter = 60) {
    super(`CoinGecko rate limit exceeded — retry after ${retryAfter}s`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

// ── Request counter for rate-limit proximity warning ─────────────────────────
// CoinGecko free tier: ~10-30 req/min. Warn at RATE_LIMIT_WARN_THRESHOLD.
const RATE_LIMIT_WARN_THRESHOLD = 8;
let _cgRequestCount = 0;
let _cgWindowStart = Date.now();

function trackCoinGeckoRequest() {
  const now = Date.now();
  // Reset counter every 60 seconds
  if (now - _cgWindowStart >= 60_000) {
    _cgRequestCount = 0;
    _cgWindowStart = now;
  }
  _cgRequestCount++;
  if (_cgRequestCount >= RATE_LIMIT_WARN_THRESHOLD) {
    console.warn(
      `[Oracle] CoinGecko request count approaching rate limit: ${_cgRequestCount} requests in current window`
    );
  }
}

/** Source 1: CoinGecko — optional API key via COINGECKO_API_KEY env var */
async function fetchCoinGecko() {
  trackCoinGeckoRequest();

  const headers = {};
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const response = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { timeout: 5000, headers, validateStatus: null }
  );

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers["retry-after"] ?? "60", 10);
    throw new RateLimitError(retryAfter);
  }

  if (response.status !== 200) {
    throw new Error(`CoinGecko returned HTTP ${response.status}`);
  }

  return response.data.bitcoin.usd;
}

/** Source 2: Binance public ticker — no API key required */
async function fetchBinance() {
  const { data } = await axios.get(
    "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    { timeout: 5000 }
  );
  return parseFloat(data.price);
}

/** Source 3: Coinbase public price endpoint — no API key required */
async function fetchCoinbase() {
  const { data } = await axios.get(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    { timeout: 5000 }
  );
  return parseFloat(data.data.amount);
}

/** Source 4: Kraken public ticker — no API key required */
async function fetchKraken() {
  const { data } = await axios.get(
    "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    { timeout: 5000 }
  );
  // Kraken returns last trade price as first element of 'c' array
  return parseFloat(data.result.XXBTZUSD.c[0]);
}

/**
 * Source 5: CoinMarketCap — requires CMC_API_KEY environment variable.
 *
 * Auth Enforcement: the API key is read exclusively from process.env.CMC_API_KEY.
 * It must NEVER be hard-coded here. Add it to your .env file (never commit it).
 *
 * Free tier endpoint: /v1/cryptocurrency/quotes/latest
 * Docs: https://coinmarketcap.com/api/documentation/v1/
 */
async function fetchCoinMarketCap() {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    throw new Error("CMC_API_KEY environment variable is not set");
  }
  const { data } = await axios.get(
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
    {
      timeout: 5000,
      headers: {
        // API key passed in header — never in URL query params
        "X-CMC_PRO_API_KEY": apiKey,
        Accept: "application/json",
      },
      params: { symbol: "BTC", convert: "USD" },
    }
  );
  return data.data.BTC.quote.USD.price;
}

/** All BTC/USD sources — add new fetchers here */
const btcSources = [fetchCoinGecko, fetchBinance, fetchCoinbase, fetchKraken, fetchCoinMarketCap];

module.exports = {
  RateLimitError,
  btcSources,
  fetchCoinGecko,
  fetchBinance,
  fetchCoinbase,
  fetchKraken,
  fetchCoinMarketCap,
};

