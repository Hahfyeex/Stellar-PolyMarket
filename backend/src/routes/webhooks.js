const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const WebhookDeliveryService = require('../services/webhookDeliveryService');

// POST /api/webhooks/subscribe - Subscribe to oracle events
router.post('/subscribe', async (req, res) => {
    const { url, event_types } = req.body;
    
    if (!url || !event_types || !Array.isArray(event_types)) {
        return res.status(400).json({ error: 'url and event_types (array) are required' });
    }

    try {
        const result = await db.query(
            'INSERT INTO webhook_subscriptions (url, event_types) VALUES ($1, $2) RETURNING id',
            [url, event_types]
        );
        
        res.status(201).json({ 
            status: 'success', 
            data: { id: result.rows[0].id } 
        });
    } catch (err) {
        logger.error({ err }, 'Failed to create webhook subscription');
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Async Webhook Trigger
 */
async function triggerWebhookAsync(subscriptionId, eventType, payload) {
    try {
        await WebhookDeliveryService.enqueueDelivery(subscriptionId, eventType, payload);
        logger.info({ subscriptionId, eventType }, 'Webhook delivery enqueued.');
    } catch (err) {
        logger.error({ err, subscriptionId, eventType }, 'Failed to enqueue webhook delivery');
    }
}

module.exports = router;
module.exports.triggerWebhookAsync = triggerWebhookAsync;
