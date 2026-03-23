const axios = require("axios");

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || "http://localhost:5001/stellar-polymarket/us-central1/sendPushNotification";

/**
 * Trigger a notification for a market status change
 * @param {number} marketId 
 * @param {string} newStatus - 'PROPOSED' or 'RESOLVED'
 */
async function triggerNotification(marketId, newStatus) {
  console.log(`[Notification Trigger] Market #${marketId} status changed to ${newStatus}`);
  try {
    // In a real cloud production environment, this would be an internal network call or a pub/sub event.
    // For this implementation, we'll simulate it with a webhook-style POST request.
    await axios.post(NOTIFICATION_SERVICE_URL, {
      marketId,
      status: newStatus,
    });
  } catch (err) {
    console.warn(`[Notification Trigger] Failed to alert notification service: ${err.message}`);
    // We don't want to fail the main transaction if notifications fail
  }
}

module.exports = { triggerNotification };
