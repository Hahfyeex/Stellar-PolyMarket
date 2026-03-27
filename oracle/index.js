require("dotenv").config();
const axios = require("axios");
const { OracleMedianizer } = require("./medianizer");
const { btcSources } = require("./sources");

const API_URL = process.env.API_URL || "http://localhost:4000";

// ── Graceful Shutdown State ───────────────────────────────────────────────────

let intervalHandle = null;
let isRunning = false;
let isShuttingDown = false;

/**
 * Fetch all unresolved, expired markets and resolve them
 */
async function runOracle() {
  // Prevent concurrent oracle runs
  if (isRunning) {
    console.log("[Oracle] Oracle is already running, skipping this cycle");
    return;
  }

  isRunning = true;
  try {
    console.log("[Oracle] Checking for markets to resolve...");
    const { data } = await axios.get(`${API_URL}/api/markets`);
    const now = Date.now();

    const expired = data.markets.filter(
      (m) => !m.resolved && new Date(m.end_date).getTime() <= now
    );

    console.log(`[Oracle] Found ${expired.length} market(s) to resolve`);

    for (const market of expired) {
      // Check if shutdown was requested during resolution
      if (isShuttingDown) {
        console.log("[Oracle] Shutdown requested, stopping market resolution");
        break;
      }
      await resolveMarket(market);
    }
  } catch (err) {
    console.error("[Oracle] Error:", err.message);
  } finally {
    isRunning = false;
  }
}

async function resolveMarket(market) {
  console.log(`[Oracle] Resolving market #${market.id}: "${market.question}"`);
  try {
    const winningOutcome = await fetchOutcome(market.question, market.outcomes);
    await axios.post(`${API_URL}/api/markets/${market.id}/resolve`, { winningOutcome });
    console.log(`[Oracle] Market #${market.id} resolved → outcome index: ${winningOutcome}`);
  } catch (err) {
    console.error(`[Oracle] Failed to resolve market #${market.id}:`, err.message);
  }
}

/**
 * Determine winning outcome based on question type.
 * Extend this with real API integrations per category.
 */
async function fetchOutcome(question, outcomes) {
  const q = question.toLowerCase();

  if (q.includes("bitcoin") || q.includes("btc") || q.includes("price")) {
    return await resolveCryptoPrice(question, outcomes);
  }

  if (q.includes("inflation") || q.includes("ngn") || q.includes("usd")) {
    return await resolveFinancial(question, outcomes);
  }

  // Default: return 0 (first outcome) — replace with real logic
  console.warn(`[Oracle] No resolver matched for: "${question}" — defaulting to outcome 0`);
  return 0;
}

async function resolveCryptoPrice(question, outcomes) {
  try {
    // Use medianizer to aggregate 4 independent BTC/USD sources in parallel,
    // filter outliers, and return a manipulation-resistant median price.
    const medianizer = new OracleMedianizer(btcSources);
    const btcPrice = await medianizer.aggregate();
    console.log(`[Oracle] BTC median price: ${btcPrice}`);

    if (question.toLowerCase().includes("100k") || question.includes("100,000")) {
      return btcPrice >= 100000 ? 0 : 1;
    }
    return 0;
  } catch (err) {
    console.error("[Oracle] Crypto price aggregation failed:", err.message);
    return 0;
  }
}

async function resolveFinancial(question, outcomes) {
  // Placeholder — integrate with a financial data API (e.g. ExchangeRate-API)
  console.warn("[Oracle] Financial resolver not yet integrated — defaulting to outcome 0");
  return 0;
}

/**
 * Gracefully shutdown the oracle process.
 * Clears the interval, waits for any in-progress run to complete,
 * then exits cleanly.
 */
async function gracefulShutdown(signal) {
  console.log(`[Oracle] ${signal} received, shutting down gracefully...`);
  isShuttingDown = true;

  // Stop scheduling new runs
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[Oracle] Interval cleared");
  }

  // Wait for any in-progress run to complete
  if (isRunning) {
    console.log("[Oracle] Waiting for current cycle to complete...");
    // Poll until the current run finishes
    while (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log("[Oracle] Current cycle completed");
  }

  console.log("[Oracle] Oracle shutting down gracefully");
  process.exit(0);
}

// ── Signal Handlers ───────────────────────────────────────────────────────────

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── Start Oracle ──────────────────────────────────────────────────────────────

// Run oracle immediately on startup
runOracle();

// Run oracle every 60 seconds
intervalHandle = setInterval(runOracle, 60 * 1000);

// Export for testing
module.exports = {
  runOracle,
  resolveMarket,
  fetchOutcome,
  resolveCryptoPrice,
  resolveFinancial,
  gracefulShutdown,
  getState: () => ({ isRunning, isShuttingDown, intervalHandle }),
  _resetState: () => {
    intervalHandle = null;
    isRunning = false;
    isShuttingDown = false;
  },
};
