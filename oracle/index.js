require("dotenv").config();
const axios = require("axios");
const { OracleMedianizer } = require("./medianizer");
const { btcSources } = require("./sources");

const API_URL = process.env.API_URL || "http://localhost:4000";

// ── Graceful Shutdown State ───────────────────────────────────────────────────

let intervalHandle = null;
let isRunning = false;
let isShuttingDown = false;
let currentRunPromise = Promise.resolve();

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
    if (err.message && err.message.startsWith("No resolver matched")) {
      console.error(`[Oracle] Unresolvable market #${market.id}: ${err.message}`);
      await markUnresolvable(market.id, err.message);
    } else {
      console.error(`[Oracle] Failed to resolve market #${market.id}:`, err.message);
    }
  }
}

async function markUnresolvable(marketId, reason) {
  try {
    await axios.post(`${API_URL}/api/markets/${marketId}/unresolvable`, { reason });
    console.warn(`[Oracle] Market #${marketId} marked unresolvable: ${reason}`);
  } catch (err) {
    console.error(`[Oracle] Failed to mark market #${marketId} as unresolvable:`, err.message);
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

  // No resolver matched — never default to outcome 0
  throw new Error(`No resolver matched for: "${question}"`);
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

// ── Graceful shutdown (#374) ──────────────────────────────────────────────────

/**
 * Graceful shutdown handler
 * Stops the interval, waits for in-flight resolutions to complete, then exits
 */
async function gracefulShutdown(signal) {
  console.log(`[Oracle] ${signal} received — Oracle shutting down gracefully`);
  
  isShuttingDown = true;
  
  // Stop scheduling new resolution cycles
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    console.log("[Oracle] Interval cleared, no new resolution cycles will start");
  }
  
  // Wait for any in-flight resolution to complete
  try {
    await currentRunPromise;
    console.log("[Oracle] In-flight resolutions completed");
  } catch (err) {
    console.error("[Oracle] Error waiting for in-flight resolutions:", err.message);
  }
  
  console.log("[Oracle] Graceful shutdown complete");
  process.exit(0);
}

/**
 * Wrapper to track the current run promise
 */
async function runOracleGuarded() {
  if (isRunning) {
    console.warn("[Oracle] Skipping run — previous cycle still in progress");
    return;
  }
  
  isRunning = true;
  try {
    await runOracle();
  } finally {
    isRunning = false;
  }
}

// Register signal handlers for graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start the oracle interval
intervalHandle = setInterval(() => {
  currentRunPromise = runOracleGuarded();
}, 60 * 1000);

// Kick off first run immediately
currentRunPromise = runOracleGuarded();

console.log("[Oracle] Started with 60-second resolution cycle");

// Exported for unit tests only
module.exports = {
  runOracle,
  runOracleGuarded,
  resolveMarket,
  fetchOutcome,
  markUnresolvable,
  gracefulShutdown,
  _getIsRunning: () => isRunning,
  _getIsShuttingDown: () => isShuttingDown,
  _getIntervalHandle: () => intervalHandle,
};
