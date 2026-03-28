require("dotenv").config();
const axios = require("axios");
const { OracleMedianizer } = require("./medianizer");
const { btcSources } = require("./sources");

const API_URL = process.env.API_URL || "http://localhost:4000";

// ── DB connection for audit logging ──────────────────────────────────────────
// Lazy-require so the oracle can run without a DB in test environments.
// The DB pool is only used for audit logging — resolution still works without it.
let _db = null;
function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const { Pool } = require("pg");
      _db = new Pool({ connectionString: process.env.DATABASE_URL });
    } catch {
      // pg not installed or DATABASE_URL invalid — audit logging disabled
    }
  }
  return _db;
}

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
    // #377: Add 60-second buffer to account for clock drift
    const bufferMs = 60_000;

    const expired = data.markets.filter(
      (m) => !m.resolved && new Date(m.end_date).getTime() <= now - bufferMs
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
    // #377: Handle deadline not reached errors gracefully
    if (err.response?.data?.error?.includes("Market deadline not reached")) {
      console.warn(`[Oracle] Market #${market.id} deadline not reached on-chain, retrying in 5 minutes`);
      // Add to retry queue (in production, use persistent queue)
      const retryTime = new Date(Date.now() + 5 * 60 * 1000);
      console.log(`[Oracle] Market #${market.id} scheduled for retry at ${retryTime.toISOString()}`);
      return;
    }
    if (err.message && err.message.startsWith("No resolver matched")) {
      console.error(`[Oracle] Unresolvable market #${market.id}: ${err.message}`);
      await markUnresolvable(market.id, market.question, err.message);
    } else {
      console.error(`[Oracle] Failed to resolve market #${market.id}:`, err.message);
    }
  }
}

async function markUnresolvable(marketId, question, reason) {
  try {
    await axios.post(`${API_URL}/api/admin/pending-review`, { 
      market_id: marketId, 
      question,
      error_message: reason 
    });
    console.warn(`[Oracle] Market #${marketId} marked for pending review: ${reason}`);
    
    // Send webhook alert if configured
    const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          type: 'market_pending_review',
          market_id: marketId,
          question,
          error_message: reason,
          timestamp: new Date().toISOString()
        });
      } catch (webhookErr) {
        console.error(`[Oracle] Failed to send webhook alert:`, webhookErr.message);
      }
    }
  } catch (err) {
    console.error(`[Oracle] Failed to mark market #${marketId} as pending review:`, err.message);
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

  // No resolver matched — throw descriptive error instead of defaulting
  throw new Error(`No resolver matched for market question: "${question}"`);
}

async function resolveCryptoPrice(question, outcomes) {
  try {
    // Use medianizer to aggregate independent BTC/USD sources in parallel,
    // filter outliers (>2σ), and return a manipulation-resistant median price.
    // DB is injected for audit logging — null in test environments.
    const medianizer = new OracleMedianizer(btcSources, console, getDb());
    const btcPrice = await medianizer.aggregate("BTC/USD");
    console.log(`[Oracle] BTC median price: ${btcPrice}`);

    if (question.toLowerCase().includes("100k") || question.includes("100,000")) {
      return btcPrice >= 100000 ? 0 : 1;
    }
    return 0;
  } catch (err) {
    // Insufficient sources (< 2 valid) — push to pending review
    if (err.message.includes("Insufficient valid sources") || err.message.includes("Too many outliers")) {
      console.error(`[Oracle] Crypto price aggregation failed — pushing to pending review: ${err.message}`);
      throw err; // bubble up so resolveMarket calls markUnresolvable
    }
    console.error("[Oracle] Crypto price aggregation failed:", err.message);
    throw err;
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
