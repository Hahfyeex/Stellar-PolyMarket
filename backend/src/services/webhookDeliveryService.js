const db = require('../db');
const logger = require('../utils/logger');
const axios = require('axios');

class WebhookDeliveryService {
    /**
     * Enqueue a webhook delivery.
     * Inserts a PENDING record into the database.
     */
    static async enqueueDelivery(subscriptionId, eventType, payload) {
        const query = `
            INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, attempts, next_attempt_at)
            VALUES ($1, $2, $3, 'PENDING', 0, NOW())
            RETURNING id
        `;
        const values = [subscriptionId, eventType, JSON.stringify(payload)];
        
        try {
            const result = await db.query(query, values);
            logger.info({ deliveryId: result.rows[0].id, subscriptionId, eventType }, "Webhook delivery enqueued.");
            return result.rows[0].id;
        } catch (err) {
            logger.error({ err, subscriptionId, eventType }, "Failed to enqueue webhook delivery");
            throw err;
        }
    }

    /**
     * Attempts to deliver all pending webhooks where next_attempt_at is in the past.
     */
    static async processPendingDeliveries() {
        const query = `
            SELECT d.id, d.webhook_id, d.event_type, d.payload, d.attempts, s.url
            FROM webhook_deliveries d
            JOIN webhook_subscriptions s ON d.webhook_id = s.id
            WHERE d.status = 'PENDING' AND d.next_attempt_at <= NOW()
            LIMIT 50
        `;
        
        try {
            const result = await db.query(query);
            const pending = result.rows;
            
            if (pending.length === 0) return;

            logger.info({ count: pending.length }, "Processing pending webhook deliveries");

            for (const delivery of pending) {
                await this.deliver(delivery);
            }
        } catch (err) {
            logger.error({ err }, "Error processing pending deliveries");
        }
    }

    /**
     * Single delivery attempt logic.
     */
    static async deliver(delivery) {
        const { id, url, event_type, payload, attempts } = delivery;
        const currentAttempt = attempts + 1;
        const maxAttempts = 5;

        try {
            const response = await axios.post(url, {
                event_type,
                payload,
                timestamp: new Date().toISOString(),
                delivery_id: id,
                attempt: currentAttempt
            }, { timeout: 10000 });

            // Success
            await db.query(`
                UPDATE webhook_deliveries 
                SET status = 'DELIVERED', 
                    attempts = $1, 
                    response_code = $2, 
                    last_error = NULL,
                    updated_at = NOW()
                WHERE id = $3
            `, [currentAttempt, response.status, id]);

            logger.info({ id, status: response.status }, "Webhook delivered successfully.");
        } catch (err) {
            const responseCode = err.response ? err.response.status : null;
            const errorMsg = err.message || "Unknown delivery error";
            
            if (currentAttempt >= maxAttempts) {
                // Mark as FAILED after max attempts
                await db.query(`
                    UPDATE webhook_deliveries 
                    SET status = 'FAILED', 
                        attempts = $1, 
                        response_code = $2, 
                        last_error = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [currentAttempt, responseCode, errorMsg, id]);
                
                logger.warn({ id, attempts: currentAttempt, err: errorMsg }, "Webhook delivery permanently FAILED.");
            } else {
                // Exponential Backoff: 2^attempts minutes
                const backoffMinutes = Math.pow(2, currentAttempt);
                await db.query(`
                    UPDATE webhook_deliveries 
                    SET attempts = $1, 
                        response_code = $2, 
                        last_error = $3, 
                        next_attempt_at = NOW() + INTERVAL '${backoffMinutes} minutes',
                        updated_at = NOW()
                    WHERE id = $4
                `, [currentAttempt, responseCode, errorMsg, id]);

                logger.info({ id, next_attempt_at: backoffMinutes, err: errorMsg }, "Webhook delivery failed, scheduled retry with exponential backoff.");
            }
        }
    }
}

module.exports = WebhookDeliveryService;
