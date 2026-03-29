/**
 * jobs/expireMarkets.js — Automated stale-market expiry job
 *
 * Runs every hour via node-cron.
 * Marks markets EXPIRED when:
 *   - resolved = FALSE
 *   - end_date < NOW() - 2 hours  (grace period)
 *
 * Logs every expired market and records them in `expired_markets_digest`
 * so a daily admin digest can be sent.
 */

"use strict";

const cron = require("node-cron");
const db = require("../db");
const logger = require("../utils/logger");

const GRACE_PERIOD_HOURS = 2;

/**
 * Core expiry logic — exported for unit testing.
 * @param {object} [opts]
 * @param {() => Date} [opts.now] - injectable clock for testing
 * @returns {Promise<Array<{id: number, question: string}>>} expired markets
 */
async function expireStaleMarkets({ now = () => new Date() } = {}) {
  const cutoff = new Date(now().getTime() - GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  const result = await db.query(
    `UPDATE markets
        SET status = 'EXPIRED'
      WHERE resolved = FALSE
        AND status NOT IN ('EXPIRED', 'RESOLVED', 'CONFIRMED')
        AND end_date < $1
        AND deleted_at IS NULL
      RETURNING id, question`,
    [cutoff]
  );

  const expired = result.rows;

  if (expired.length === 0) {
    logger.info("Market expiry job: no stale markets found");
    return expired;
  }

  // Log each expired market
  for (const { id, question } of expired) {
    logger.info({ market_id: id, question }, "Market auto-expired");
  }

  // Persist to digest table for daily admin alert
  const values = expired.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  const params = expired.flatMap(({ id, question }) => [id, question]);

  await db.query(
    `INSERT INTO expired_markets_digest (market_id, question) VALUES ${values}`,
    params
  );

  logger.info({ count: expired.length }, "Market expiry job: markets expired");
  return expired;
}

/**
 * Collect all digest entries from the last 24 hours.
 * Called by the daily admin alert mechanism.
 */
async function getDailyDigest() {
  const result = await db.query(
    `SELECT market_id, question, expired_at
       FROM expired_markets_digest
      WHERE expired_at >= NOW() - INTERVAL '24 hours'
      ORDER BY expired_at ASC`
  );
  return result.rows;
}

/**
 * Start the hourly cron job.
 */
function start() {
  cron.schedule("0 * * * *", async () => {
    logger.info("Running hourly market expiry job");
    try {
      await expireStaleMarkets();
    } catch (err) {
      logger.error({ err: err.message }, "Market expiry job failed");
    }
  });
  logger.info("Market expiry cron started (every hour)");
}

module.exports = { start, expireStaleMarkets, getDailyDigest, GRACE_PERIOD_HOURS };
