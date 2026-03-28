const db = require("../db");
const logger = require("./logger");

/**
 * Trigger a notification by inserting a row into the notifications table.
 * @param {string} walletAddress
 * @param {string} type - e.g. 'MARKET_PROPOSED' | 'MARKET_RESOLVED'
 * @param {string} message
 * @param {number|null} marketId
 */
async function triggerNotification(walletAddress, type, message, marketId = null) {
  try {
    logger.info(
      { wallet_address: walletAddress, type, market_id: marketId },
      "Triggering notification"
    );
    await db.query(
      `INSERT INTO notifications (wallet_address, type, message, market_id) VALUES ($1, $2, $3, $4)`,
      [walletAddress, type, message, marketId]
    );
    logger.debug({ wallet_address: walletAddress, type }, "Notification inserted");
  } catch (err) {
    logger.warn(
      { err: err.message, market_id: marketId, type },
      "Failed to insert notification"
    );

    // Dead-letter mechanism: persistence for later retry
    try {
      await db.query(
        `INSERT INTO failed_notifications (wallet_address, type, message, market_id, error_message) VALUES ($1, $2, $3, $4, $5)`,
        [walletAddress, type, message, marketId, err.message]
      );
    } catch (dlqErr) {
      logger.error(
        { err: dlqErr.message, original_err: err.message, market_id: marketId },
        "Critical error: failed to insert into dead-letter queue"
      );
    }
    // Non-blocking — do not re-throw error to avoid failing market resolution
  }
}

module.exports = { triggerNotification };
