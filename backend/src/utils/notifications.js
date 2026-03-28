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
  logger.info(
    { wallet_address: walletAddress, type, market_id: marketId },
    "Triggering notification"
  );
  try {
    await db.query(
      `INSERT INTO notifications (wallet_address, type, message, market_id) VALUES ($1, $2, $3, $4)`,
      [walletAddress, type, message, marketId]
    );
    logger.debug({ wallet_address: walletAddress, type }, "Notification inserted");
  } catch (err) {
    logger.warn(
      { err: err.message, wallet_address: walletAddress, type },
      "Failed to insert notification"
    );
    // Non-blocking — don't fail the caller
  }
}

module.exports = { triggerNotification };
