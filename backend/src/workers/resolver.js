/**
 * workers/resolver.js — Automated market resolver
 *
 * Runs a cron job every 5 minutes that:
 *   1. Queries the DB for expired, unresolved markets
 *   2. Calls the appropriate oracle for each market
 *   3. Retries up to 3 times with exponential backoff on failure
 *   4. Inserts into dead_letter_queue after 3 consecutive failures
 */

const cron = require("node-cron");
const db = require("../db");
const { resolveMarket } = require("../oracles");
const logger = require("../utils/logger");
const { triggerNotification } = require("../utils/notifications");

const MAX_ATTEMPTS = 3;
const HIGH_VALUE_THRESHOLD = BigInt(process.env.HIGH_VALUE_THRESHOLD || "100000000000");

/**
 * Exponential backoff delay: 1s, 2s, 4s for attempts 0, 1, 2.
 * Exported for testing without real timers.
 */
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Call the oracle for a market, retrying up to MAX_ATTEMPTS times.
 * Each retry waits 2^attempt * 1000ms before the next call.
 *
 * @param {object} market - DB row
 * @returns {Promise<number>} winning outcome index
 * @throws after MAX_ATTEMPTS failures
 */
async function resolveWithRetry(market) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await resolveMarket(market);
    } catch (err) {
      lastError = err;
      logger.warn(
        { marketId: market.id, attempt: attempt + 1, err: err.message },
        "Oracle call failed, retrying"
      );
      // Exponential backoff: 1s → 2s → 4s
      if (attempt < MAX_ATTEMPTS - 1) {
        await delay(Math.pow(2, attempt) * 1000);
      }
    }
  }
  throw lastError;
}

/**
 * Insert a failed market into the dead-letter queue so it can be
 * manually reviewed or re-queued by an admin.
 */
async function deadLetter(market, error) {
  await db.query(
    `INSERT INTO dead_letter_queue (market_id, oracle_type, error, attempts)
     VALUES ($1, $2, $3, $4)`,
    [market.id, market.category || "general", error.message, MAX_ATTEMPTS]
  );
  logger.error(
    { marketId: market.id, error: error.message },
    "Market sent to dead-letter queue after max retries"
  );
}

/**
 * Core job: find all expired unresolved markets and attempt resolution.
 * Exported so it can be called directly in tests or admin triggers.
 */
async function checkExpiredMarkets() {
  let markets;
  try {
    const result = await db.query(
      `SELECT * FROM markets
       WHERE end_date <= NOW() AND resolved = false
       ORDER BY end_date ASC`
    );
    markets = result.rows;
  } catch (err) {
    logger.error({ err: err.message }, "Failed to query expired markets");
    return;
  }

  logger.info({ count: markets.length }, "Checking expired markets");

  for (const market of markets) {
    try {
      const winningOutcome = await resolveWithRetry(market);
      const totalPool = BigInt(Math.floor(parseFloat(market.total_pool || '0') * 10_000_000));

      if (totalPool >= HIGH_VALUE_THRESHOLD) {
        // High-value market: require admin confirmation before resolving
        await db.query(
          `UPDATE markets
           SET status = 'PENDING_CONFIRMATION', proposed_outcome = $1
           WHERE id = $2`,
          [winningOutcome, market.id]
        );

        logger.info(
          { marketId: market.id, winningOutcome, totalPool: totalPool.toString() },
          'High-value market set to PENDING_CONFIRMATION'
        );

        // Send admin alert with market details and proposed outcome
        await triggerNotification(
          null,
          'HIGH_VALUE_RESOLUTION',
          `High-value market "${market.question}" (pool: ${market.total_pool}) requires admin confirmation. Proposed outcome: ${market.outcomes[winningOutcome]}`,
          market.id
        );
      } else {
        // Below threshold: resolve immediately
        await db.query(
          `UPDATE markets
           SET resolved = true, winning_outcome = $1, status = 'RESOLVED'
           WHERE id = $2`,
          [winningOutcome, market.id]
        );

        logger.info(
          { marketId: market.id, winningOutcome },
          'Market resolved successfully'
        );
      }
    } catch (err) {
      // All retries exhausted — send to dead-letter queue
      await deadLetter(market, err);
    }
  }
  }
}

/**
 * Start the cron scheduler.
 * Runs every 5 minutes: '* /5 * * * *'
 */
function start() {
  cron.schedule("*/5 * * * *", async () => {
    logger.info("Running automated market resolver");
    await checkExpiredMarkets();
  });
  logger.info("Automated resolver cron started (every 5 minutes)");
}

module.exports = { start, checkExpiredMarkets, resolveWithRetry, deadLetter, delay, HIGH_VALUE_THRESHOLD };
