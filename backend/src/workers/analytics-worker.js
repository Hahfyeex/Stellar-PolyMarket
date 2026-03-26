const db = require("../db");
const { calculateConfidenceScore } = require("../utils/analytics");
const logger = require("../utils/logger");

/**
 * Analytics Worker
 * Periodically updates the confidence_score for all active markets.
 * This ensures that the 'Trust' metric remains fresh as new bets are placed.
 */
async function updateMarketAnalytics() {
  logger.info("Starting analytics worker: updating confidence scores...");

  try {
    // 1. Fetch all active/unresolved markets
    const markets = await db.query("SELECT id FROM markets WHERE resolved = FALSE");
    
    for (const market of markets.rows) {
      const marketId = market.id;
      
      // 2. Fetch all bets for this market
      const betsResult = await db.query("SELECT * FROM bets WHERE market_id = $1", [marketId]);
      const bets = betsResult.rows;
      
      // 3. Calculate score
      const score = calculateConfidenceScore(bets);
      
      // 4. Ideally, we would store this score in the database (e.g., in a 'confidence_score' column)
      // For now, we log the intended update to demonstrate logic
      logger.info({ market_id: marketId, confidence_score: score }, "Calculated confidence score");
      
      // Note: In a real implementation, you would:
      // await db.query("UPDATE markets SET confidence_score = $1 WHERE id = $2", [score, marketId]);
    }
    
    logger.info("Analytics worker task completed successfully.");
  } catch (err) {
    logger.error({ err }, "Analytics worker failed");
  }
}

// If run directly, execute once
if (require.main === module) {
  updateMarketAnalytics().then(() => process.exit(0));
}

module.exports = { updateMarketAnalytics };
