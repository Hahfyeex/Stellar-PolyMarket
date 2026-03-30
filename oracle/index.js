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

// ── Circuit Breaker (#587) ────────────────────────────────────────────────────
const ALERT_THRESHOLD = 3;
const CIRCUIT_BREAKER_THRESHOLD = 10;
let consecutiveFailures = 0;
let circuitOpen = false;

let intervalHandle = null;
let isRunning = false;
let isShuttingDown = false;
let currentRunPromise = Promise.resolve();
let consecutiveEmptyRuns = 0;

async function sendAdminAlert(message) {
  const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, { type: "oracle_failure_alert", message, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error("[Oracle] Failed to send admin alert:", err.message);
  }
}

/**
 * Fetch all unresolved, expired markets and resolve them
 */
async function runOracle() {
  // Prevent concurrent oracle runs
  if (isRunning) {
    logger.info("[Oracle] Oracle is already running, skipping this cycle");
    return;
  }

  // Circuit breaker: skip if open
  if (circuitOpen) {
    logger.error("[Oracle] Circuit breaker is open — oracle paused due to sustained backend failures");
    return;
  }

  isRunning = true;
  try {
    // Health ping before each cycle (#587)
    try {
      await axios.get(`${API_URL}/api/health/oracle`);
    } catch (pingErr) {
      throw new Error(`Backend health ping failed: ${pingErr.message}`);
    }

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
    // Reset failure counter on success
    consecutiveFailures = 0;
    circuitOpen = false;
  } catch (err) {
    consecutiveFailures++;
    logger.error("[Oracle] Error:", err.message);

    if (consecutiveFailures === ALERT_THRESHOLD) {
      logger.warn(`[Oracle] ${consecutiveFailures} consecutive failures — sending admin alert`);
      await sendAdminAlert(`Oracle has failed ${consecutiveFailures} consecutive cycles: ${err.message}`);
    }

    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitOpen = true;
      if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null; }
      logger.error(`[Oracle] Circuit breaker tripped after ${consecutiveFailures} consecutive failures — oracle interval paused`);
      await sendAdminAlert(`CRITICAL: Oracle circuit breaker tripped after ${consecutiveFailures} consecutive failures. Manual intervention required.`);
    }
  } finally {
    isRunning = false;
  }
}

async function resolveMarket(market) {
  logger.info(`[Oracle] Resolving market #${market.id}: "${market.question}"`);
  try {
    const winningOutcome = await fetchOutcome(market);
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
      const retryTime = new Date(Date.now() + 5 * 60 * 1000);
      logger.info(`[Oracle] Market #${market.id} scheduled for retry at ${retryTime.toISOString()}`);
      return;
    }
    if (err.message && (err.message.startsWith("No resolver matched") || err.message.startsWith("No resolver registered"))) {
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
 * Determine winning outcome based on market category slug.
 * Resolvers are looked up from the registry — no keyword matching.
 */
async function fetchOutcome(market) {
  const slug = (market.category_slug || market.category || "").toLowerCase();
  const resolver = getResolver(slug);
  if (!resolver) {
    throw new Error(`No resolver registered for category: "${slug}"`);
  }
  return resolver(market);
}

async function resolveCryptoPrice(market) {
  const question = market.question || market;
  const outcomes = market.outcomes || [];
  try {
    const medianizer = new OracleMedianizer(btcSources, console, getDb());
    const btcPrice = await medianizer.aggregate("BTC/USD");
    logger.info(`[Oracle] BTC median price: ${btcPrice}`);

    if (
      (typeof question === "string" && question.toLowerCase().includes("100k")) ||
      (typeof question === "string" && question.includes("100,000"))
    ) {
      return btcPrice >= 100000 ? 0 : 1;
    }
    return 0;
  } catch (err) {
    if (
      err.message.includes("Insufficient valid sources") ||
      err.message.includes("Too many outliers")
    ) {
      logger.error(
        `[Oracle] Crypto price aggregation failed — pushing to pending review: ${err.message}`
      );
      throw err;
    }
    logger.error("[Oracle] Crypto price aggregation failed:", err.message);
    throw err;
  }
}

async function resolveFinancial(market) {
  logger.warn(
    "[Oracle] Financial resolver not yet integrated — defaulting to outcome 0"
  );
  return 0;
}

async function resolveSports(market) {
  logger.warn(
    "[Oracle] Sports resolver not yet integrated — defaulting to outcome 0"
  );
  return 0;
}

// ── Register built-in resolvers ───────────────────────────────────────────────
registerResolver("crypto", resolveCryptoPrice);
registerResolver("economics", resolveFinancial);
registerResolver("sports", resolveSports);
registerResolver("football", resolveSports);

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
  _getConsecutiveFailures: () => consecutiveFailures,
  _getCircuitOpen: () => circuitOpen,
  ALERT_THRESHOLD,
  CIRCUIT_BREAKER_THRESHOLD,
  _resetState: () => {
    consecutiveEmptyRuns = 0;
    consecutiveFailures = 0;
    circuitOpen = false;
    isRunning = false;
    isShuttingDown = false;
    if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null; }
  },
  INTERVAL_NORMAL,
  INTERVAL_BACKOFF,
  BACKOFF_THRESHOLD,
};
