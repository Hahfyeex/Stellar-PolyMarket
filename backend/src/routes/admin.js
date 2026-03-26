/**
 * routes/admin.js
 *
 * Admin-only endpoints for manual market resolution override.
 * All routes require a valid JWT (see middleware/jwtAuth.js).
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const jwtAuth = require('../middleware/jwtAuth');
const logger = require('../utils/logger');

// POST /api/admin/markets/:id/resolve
// Body: { winning_outcome: number }
router.post('/markets/:id/resolve', jwtAuth, async (req, res) => {
  const marketId = parseInt(req.params.id, 10);
  const { winning_outcome } = req.body;

  if (winning_outcome == null || !Number.isInteger(winning_outcome) || winning_outcome < 0) {
    return res.status(400).json({ error: 'winning_outcome must be a non-negative integer' });
  }

  try {
    // Verify market exists and is not already resolved
    const { rows } = await db.query('SELECT * FROM markets WHERE id = $1', [marketId]);
    if (!rows.length) return res.status(404).json({ error: 'Market not found' });
    if (rows[0].resolved) return res.status(409).json({ error: 'Market already resolved' });

    // Validate outcome index is within bounds
    if (winning_outcome >= rows[0].outcomes.length) {
      return res.status(400).json({ error: 'winning_outcome index out of range' });
    }

    await db.query(
      `UPDATE markets SET resolved = true, winning_outcome = $1, status = 'RESOLVED' WHERE id = $2`,
      [winning_outcome, marketId]
    );

    logger.info({ marketId, winning_outcome, admin: req.admin.sub }, 'Admin override resolution');
    res.json({ success: true, market_id: marketId, winning_outcome });
  } catch (err) {
    logger.error({ err: err.message }, 'Admin resolve failed');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/dead-letter — list all dead-lettered markets
router.get('/dead-letter', jwtAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM dead_letter_queue ORDER BY created_at DESC'
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
