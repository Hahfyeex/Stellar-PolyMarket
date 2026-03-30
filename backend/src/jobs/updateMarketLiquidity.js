/**
 * jobs/updateMarketLiquidity.js — Automated market liquidity scoring job
 *
 * Runs every five minutes via node-cron.
 * Marks markets as liquid when total_pool >= MIN_MARKET_POOL_XLM.
 */

"use strict";

const cron = require("node-cron");
const db = require("../db");
const logger = require("../utils/logger");

const DEFAULT_MIN_POOL_XLM = 10;

function getMinPoolThreshold() {
  const parsed = parseFloat(process.env.MIN_MARKET_POOL_XLM);
  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_MIN_POOL_XLM;
  }
  return parsed;
}

async function updateMarketLiquidity({ minPool = getMinPoolThreshold() } = {}) {
  const result = await db.query(
    `UPDATE markets
      SET is_liquid = (total_pool >= $1)
      WHERE deleted_at IS NULL
        AND status NOT IN ('EXPIRED', 'RESOLVED', 'CONFIRMED')`,
    [minPool]
  );

  const updated = result.rowCount ?? 0;
  logger.info({ updated, minPool }, "Market liquidity job updated market liquidity flags");
  return { updated, minPool };
}

function start() {
  cron.schedule("*/5 * * * *", async () => {
    logger.info("Running market liquidity job");
    try {
      await updateMarketLiquidity();
    } catch (err) {
      logger.error({ err: err.message }, "Market liquidity job failed");
    }
  });
  logger.info("Market liquidity cron started (every 5 minutes)");
}

module.exports = { start, updateMarketLiquidity, getMinPoolThreshold };
