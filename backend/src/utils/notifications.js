const axios = require("axios");
const logger = require("./logger");

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || "http://localhost:5001/stellar-polymarket/us-central1/sendPushNotification";

/**
 * Trigger a notification for a market status change
 * @param {number} marketId 
 * @param {string} newStatus - 'PROPOSED' or 'RESOLVED'
 */
async function triggerNotification(marketId, newStatus) {
  logger.info({ market_id: marketId, status: newStatus }, "Triggering notification");
  try {
    // In a real cloud production environment, this would be an internal network call or a pub/sub event.
    // For this implementation, we'll simulate it with a webhook-style POST request.
    await axios.post(NOTIFICATION_SERVICE_URL, {
      marketId,
      status: newStatus,
    });
    logger.debug({ market_id: marketId, status: newStatus }, "Notification service called successfully");
  } catch (err) {
    logger.warn({ market_id: marketId, status: newStatus, err: err.message }, "Failed to alert notification service");
    // We don't want to fail the main transaction if notifications fail
  }
}

module.exports = { triggerNotification };
