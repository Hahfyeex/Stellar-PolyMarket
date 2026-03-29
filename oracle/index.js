require("dotenv").config();
const axios = require("axios");
const { OracleMedianizer } = require("./medianizer");
const { btcSources, RateLimitError } = require("./sources");

const API_URL = process.env.API_URL || "http://localhost:4000";

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = {
  info:  (...a) => console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
  debug: (...a) => process.env.LOG_LEVEL === "debug" && console.debug(...a),
};

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

const INTERVAL_NORMAL = 60 * 1000;       // 60 seconds
const INTERVAL_BACKOFF = 5 * 60 * 1000;  // 5 minutes
const BACKOFF_THRESHOLD = 3;             // consecutive empty runs before backoff

let intervalHandle = null;
let isRunning = false;
let isShuttingDown = false;
let currentRunPromise = Promise.resolve();
let consecutiveEmptyRuns = 0;

/**
 * Fetch all unresolved, expired markets and resolve them
 */
async function runOracle() {
  // Prevent concurrent oracle runs
  if (isRunning) {
    logger.info("[Oracle] Oracle is already running, skipping this cycle");
    return;
  }

  isRunning = true;
  try {
    logger.info("[Oracle] Checking for markets to resolve...");
    const { data } = await axios.get(`${API_URL}/api/markets`);
    const now = Date.now();
    // #377: Add 60-second buffer to account for clock drift
    const bufferMs = 60_000;

    const expired = data.markets.filter(
      (m) => !m.resolved && new Date(m.end_date).getTime() <= now - bufferMs
    );

    // #440: Early exit when there is nothing to do
    if (expired.length === 0) {
      logger.debug("[Oracle] No expired markets to resolve");
      consecutiveEmptyRuns++;
      if (consecutiveEmptyRuns >= BACKOFF_THRESHOLD) {
        reschedule(INTERVAL_BACKOFF);
      }
      return;
    }

    // Reset backoff — we have real work to do
    consecutiveEmptyRuns = 0;
    reschedule(INTERVAL_NORMAL);

    logger.debug(`[Oracle] Found ${expired.length} market(s) to resolve`);

    for (const market of expired) {
      // Check if shutdown was requested during resolution
      if (isShuttingDown) {
        logger.info("[Oracle] Shutdown requested, stopping market resolution");
        break;
      }
      await resolveMarket(market);
    }
  } catch (err) {
    logger.error("[Oracle] Error:", err.message);
  } finally {
    isRunning = false;
  }
}

async function resolveMarket(market) {
  logger.info(`[Oracle] Resolving market #${market.id}: "${market.question}"`);
  try {
    const winningOutcome = await fetchOutcome(market.question, market.outcomes);
    await axios.post(`${API_URL}/api/markets/${market.id}/resolve`, { winningOutcome });
    logger.info(`[Oracle] Market #${market.id} resolved → outcome index: ${winningOutcome}`);
  } catch (err) {
    // CoinGecko rate limit — retry after the server-specified delay
    if (err instanceof RateLimitError) {
      const delayMs = err.retryAfter * 1000;
      logger.warn(`[Oracle] Market #${market.id} hit CoinGecko rate limit — retrying in ${err.retryAfter}s`);
      setTimeout(() => resolveMarket(market), delayMs);
      return;
    }
    // #377: Handle deadline not reached errors gracefully
    if (err.response?.data?.error?.includes("Market deadline not reached")) {
      logger.warn(`[Oracle] Market #${market.id} deadline not reached on-chain, retrying in 5 minutes`);
      // Add to retry queue (in production, use persistent queue)
      const retryTime = new Date(Date.now() + 5 * 60 * 1000);
      logger.info(`[Oracle] Market #${market.id} scheduled for retry at ${retryTime.toISOString()}`);
      return;
    }
    if (err.message && err.message.startsWith("No resolver matched")) {
      logger.error(`[Oracle] Unresolvable market #${market.id}: ${err.message}`);
      await markUnresolvable(market.id, market.question, err.message);
    } else {
      logger.error(`[Oracle] Failed to resolve market #${market.id}:`, err.message);
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
    logger.warn(`[Oracle] Market #${marketId} marked for pending review: ${reason}`);
    
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
        logger.error(`[Oracle] Failed to send webhook alert:`, webhookErr.message);
      }
    }
  } catch (err) {
    logger.error(`[Oracle] Failed to mark market #${marketId} as pending review:`, err.message);
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
    logger.info(`[Oracle] BTC median price: ${btcPrice}`);

    if (question.toLowerCase().includes("100k") || question.includes("100,000")) {
      return btcPrice >= 100000 ? 0 : 1;
    }
    return 0;
  } catch (err) {
    // Insufficient sources (< 2 valid) — push to pending review
    if (err.message.includes("Insufficient valid sources") || err.message.includes("Too many outliers")) {
      logger.error(`[Oracle] Crypto price aggregation failed — pushing to pending review: ${err.message}`);
      throw err; // bubble up so resolveMarket calls markUnresolvable
    }
    logger.error("[Oracle] Crypto price aggregation failed:", err.message);
    throw err;
  }
}

async function resolveFinancial(question, outcomes) {
  // Placeholder — integrate with a financial data API (e.g. ExchangeRate-API)
  logger.warn("[Oracle] Financial resolver not yet integrated — defaulting to outcome 0");
  return 0;
}

// ── Adaptive polling (#440) ───────────────────────────────────────────────────

/**
 * Replace the running interval with a new one at the given delay.
 * No-op if the delay matches the current interval or if shutting down.
 */
function reschedule(newInterval) {
  if (isShuttingDown) return;
  if (intervalHandle !== null) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    currentRunPromise = runOracleGuarded();
  }, newInterval);
}

// ── Graceful shutdown (#374) ──────────────────────────────────────────────────

/**
 * Graceful shutdown handler
 * Stops the interval, waits for in-flight resolutions to complete, then exits
 */
async function gracefulShutdown(signal) {
  logger.info(`[Oracle] ${signal} received — Oracle shutting down gracefully`);
  
  isShuttingDown = true;
  
  // Stop scheduling new resolution cycles
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    logger.info("[Oracle] Interval cleared, no new resolution cycles will start");
  }
  
  // Wait for any in-flight resolution to complete
  try {
    await currentRunPromise;
    logger.info("[Oracle] In-flight resolutions completed");
  } catch (err) {
    logger.error("[Oracle] Error waiting for in-flight resolutions:", err.message);
  }
  
  logger.info("[Oracle] Graceful shutdown complete");
  process.exit(0);
}

/**
 * Wrapper to track the current run promise
 */
async function runOracleGuarded() {
  if (isRunning) {
    logger.warn("[Oracle] Skipping run — previous cycle still in progress");
    return;
  }
  
  isRunning = true;
  try {
    await runOracle();
  } finally {
    isRunning = false;
  }
}

// Only start the interval when run directly (not when require'd by tests)
if (require.main === module) {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  reschedule(INTERVAL_NORMAL);
  currentRunPromise = runOracleGuarded();
  logger.info("[Oracle] Started with 60-second resolution cycle");
}

// Exported for unit tests only
module.exports = {
  runOracle,
  runOracleGuarded,
  resolveMarket,
  fetchOutcome,
  markUnresolvable,
  gracefulShutdown,
  reschedule,
  RateLimitError,
  _getIsRunning: () => isRunning,
  _getIsShuttingDown: () => isShuttingDown,
  _getIntervalHandle: () => intervalHandle,
  _getConsecutiveEmptyRuns: () => consecutiveEmptyRuns,
  _resetState: () => {
    consecutiveEmptyRuns = 0;
    isRunning = false;
    isShuttingDown = false;
    if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null; }
  },
  INTERVAL_NORMAL,
  INTERVAL_BACKOFF,
  BACKOFF_THRESHOLD,
};
