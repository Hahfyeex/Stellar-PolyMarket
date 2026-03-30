const WebhookDeliveryService = require('../services/webhookDeliveryService');
const logger = require('../utils/logger');

/**
 * Worker to process pending webhook deliveries.
 * Runs periodically to handle retries with exponential backoff.
 */
async function runWebhookWorker() {
    logger.info("Initializing Webhook Delivery Worker...");
    
    // Process deliveries every 30 seconds
    const interval = 30000;

    setInterval(async () => {
        try {
            await WebhookDeliveryService.processPendingDeliveries();
        } catch (err) {
            logger.error({ err }, "Fatal error in webhook delivery worker loop");
        }
    }, interval);
}

module.exports = { runWebhookWorker };
