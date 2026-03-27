const axios = require('axios');
const logger = require('../utils/logger');

// Threshold is configurable via env vars, defaulting to 5000 XLM (in stroops if the chain amounts are stroops)
// Assuming amounts from indexer are base units (e.g. stroops 1 XLM = 10,000,000)
// To keep it simple, we treat them as abstract units or assume 5000 is the raw amount.
// Let's assume the threshold is 5000 units for this implementation.
const WHALE_THRESHOLD = parseInt(process.env.WHALE_THRESHOLD || process.env.WHALE_THRESHOLD_XLM) || 5000;

/**
 * Checks if a transaction is a "Whale" move and triggers a webhook.
 * @param {string} marketId The associated market ID
 * @param {string} amount The amount bet
 * @param {string} walletAddress The user wallet address
 */
async function checkWhaleTransaction(marketId, amount, walletAddress) {
    const betAmount = parseInt(amount);
    
    if (isNaN(betAmount)) {
        return false;
    }

    if (betAmount > WHALE_THRESHOLD) {
        logger.warn({
            market_id: marketId,
            wallet_address: walletAddress,
            amount: betAmount
        }, "Whale transaction detected!");

        await triggerWebhook(marketId, betAmount, walletAddress);
        return true;
    }

    return false;
}

/**
 * Triggers a Discord/Telegram Webhook notification
 */
async function triggerWebhook(marketId, amount, walletAddress) {
    const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    
    if (!WEBHOOK_URL) {
        logger.debug("Webhook URL not configured, skipping notification.");
        return;
    }

    const payload = {
        content: `🐳 **WHALE ALERT** 🐳\n\nA large transaction was detected!\n- **Market ID**: ${marketId}\n- **Amount**: ${amount} XLM\n- **Wallet**: \`${walletAddress}\``,
        username: "PolyMarket Whale Watcher",
        market_id: marketId,
        amount: amount,
        wallet_address: walletAddress
    };

    try {
        await axios.post(WEBHOOK_URL, payload);
        logger.info({ webhook: "success" }, "Whale alert webhook sent successfully.");
    } catch (err) {
        logger.error({ err: err.message }, "Failed to send Whale alert webhook");
    }
}

module.exports = {
    checkWhaleTransaction,
    triggerWebhook,
    WHALE_THRESHOLD
};
