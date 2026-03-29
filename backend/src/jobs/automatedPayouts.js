"use strict";

const cron = require("node-cron");
const db = require("../db");
const logger = require("../utils/logger");
const { distributePayouts } = require("../services/payoutService");

/**
 * Finds eligible markets and distributes payouts automatically.
 */
async function processAutomatedPayouts() {
  try {
    const result = await db.query(
      `SELECT m.id, m.question 
       FROM markets m
       LEFT JOIN governance_disputes d ON d.market_id = m.id AND d.status = 'active'
       WHERE m.resolved = TRUE 
         AND m.dispute_window_ends_at < NOW() 
         AND m.payout_distributed = FALSE 
         AND m.status != 'DISPUTED'
         AND m.deleted_at IS NULL
         AND d.id IS NULL`
    );

    const eligibleMarkets = result.rows;

    if (eligibleMarkets.length === 0) {
      logger.debug("Automated payouts job: No eligible markets found");
      return [];
    }

    logger.info({ count: eligibleMarkets.length }, "Automated payouts job: Processing markets");

    const processed = [];

    for (const market of eligibleMarkets) {
      try {
        const { winnersCount, totalDistributed, totalPool, winningStake } = await distributePayouts(market.id);

        await db.query("UPDATE markets SET payout_distributed = TRUE WHERE id = $1", [market.id]);

        await db.query(
          `INSERT INTO audit_logs (actor, action, details, timestamp) VALUES ($1, $2, $3, NOW())`,
          [
            "system",
            "AUTOMATED_PAYOUT_DISTRIBUTED",
            JSON.stringify({
              market_id: market.id,
              winners_count: winnersCount,
              total_distributed: totalDistributed,
              total_pool: totalPool,
              winning_stake: winningStake
            })
          ]
        );

        logger.info(
          { market_id: market.id, winnersCount, totalDistributed },
          "Automated payout distributed successfully"
        );

        processed.push(market.id);
      } catch (err) {
        logger.error(
          { err: err.message, market_id: market.id },
          "Failed to process automated payout for market"
        );
      }
    }

    return processed;
  } catch (err) {
    logger.error({ err: err.message }, "Automated payouts job failed to fetch markets");
    throw err;
  }
}

/**
 * Start the 15-minute cron job.
 */
function start() {
  cron.schedule("*/15 * * * *", async () => {
    logger.info("Running automated payouts job");
    await processAutomatedPayouts();
  });
  logger.info("Automated payouts cron started (every 15 minutes)");
}

module.exports = { start, processAutomatedPayouts };
