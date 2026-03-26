/**
 * routes/indexer.js
 *
 * POST /api/indexer/webhook — receives Mercury event payloads and processes them.
 * GET  /api/indexer/health  — liveness check for the indexer pipeline.
 *
 * Mercury sends a JSON body with an array of events on each delivery.
 * A shared secret (MERCURY_WEBHOOK_SECRET) is verified via the
 * X-Mercury-Signature header to prevent spoofed deliveries.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { processEvent } = require('../indexer/mercury');
const logger = require('../utils/logger');

const WEBHOOK_SECRET = process.env.MERCURY_WEBHOOK_SECRET || '';

/**
 * Verify HMAC-SHA256 signature from Mercury.
 * Mercury signs the raw body with the shared secret.
 */
function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true; // skip in dev if secret not configured
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
}

// POST /api/indexer/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['x-mercury-signature'] || '';

  if (!verifySignature(req.body, sig)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let events;
  try {
    events = JSON.parse(req.body.toString());
    if (!Array.isArray(events)) events = [events];
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Process events sequentially to preserve ledger order
  let processed = 0;
  for (const event of events) {
    try {
      await processEvent(event);
      processed++;
    } catch (err) {
      logger.error({ err: err.message, event }, 'Failed to process event');
    }
  }

  res.json({ received: events.length, processed });
});

// GET /api/indexer/health
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
