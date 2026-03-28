/**
 * routes/admin.js
 *
 * Admin-only endpoints for manual market resolution override.
 * All routes require a valid JWT (see middleware/jwtAuth.js).
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const jwtAuth = require("../middleware/jwtAuth");
const logger = require("../utils/logger");

// Utility function to log admin actions
async function logAdminAction(adminWallet, actionType, targetId, targetType, payload, req) {
  try {
    await db.query(
      `INSERT INTO admin_audit_log (admin_wallet, action_type, target_id, target_type, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [adminWallet, actionType, targetId, targetType, JSON.stringify(payload), req.ip]
    );
  } catch (err) {
    logger.error({ err: err.message }, "Failed to log admin action");
  }
}

// POST /api/admin/markets/:id/resolve
// Body: { winning_outcome: number }
router.post("/markets/:id/resolve", jwtAuth, async (req, res) => {
  const marketId = parseInt(req.params.id, 10);
  const { winning_outcome } = req.body;

  if (
    winning_outcome === null ||
    winning_outcome === undefined ||
    !Number.isInteger(winning_outcome) ||
    winning_outcome < 0
  ) {
    return res.status(400).json({ error: "winning_outcome must be a non-negative integer" });
  }

  try {
    // Verify market exists and is not already resolved
    const { rows } = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);
    if (!rows.length) return res.status(404).json({ error: "Market not found" });
    if (rows[0].resolved) return res.status(409).json({ error: "Market already resolved" });

    // Validate outcome index is within bounds
    if (winning_outcome >= rows[0].outcomes.length) {
      return res.status(400).json({ error: "winning_outcome index out of range" });
    }

    await db.query(
      `UPDATE markets SET resolved = true, winning_outcome = $1, status = 'RESOLVED' WHERE id = $2`,
      [winning_outcome, marketId]
    );

    // Log admin action
    await logAdminAction(
      req.admin.sub,
      "RESOLVE_MARKET",
      marketId,
      "MARKET",
      { winning_outcome },
      req
    );

    logger.info({ marketId, winning_outcome, admin: req.admin.sub }, "Admin override resolution");
    res.json({ success: true, market_id: marketId, winning_outcome });
  } catch (err) {
    logger.error({ err: err.message }, "Admin resolve failed");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/dead-letter — list all dead-lettered markets
router.get("/dead-letter", jwtAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM dead_letter_queue ORDER BY created_at DESC");
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/pending-review — add market to pending review queue
router.post("/pending-review", async (req, res) => {
  const { market_id, question, error_message } = req.body;

  if (!market_id || !question || !error_message) {
    return res.status(400).json({ error: "market_id, question, and error_message required" });
  }

  try {
    await db.query(
      `INSERT INTO pending_review (market_id, question, error_message, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (market_id) DO UPDATE SET error_message = $3, created_at = NOW()`,
      [market_id, question, error_message]
    );
    res.json({ success: true, market_id });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to add pending review");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/pending-review — list all pending review markets
router.get("/pending-review", jwtAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM pending_review ORDER BY created_at DESC");
    res.json({ items: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch pending review");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/markets/deleted — list all soft-deleted markets for audit
router.get("/markets/deleted", jwtAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM markets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    );
    res.json({ markets: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch deleted markets");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit-log
router.get("/audit-log", jwtAuth, async (req, res) => {
  const { actionType, startDate, endDate, limit = 20, offset = 0 } = req.query;

  try {
    const query = ["SELECT * FROM admin_audit_log WHERE 1=1"];
    const params = [];

    if (actionType) {
      params.push(actionType);
      query.push(`AND action_type = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      query.push(`AND created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      query.push(`AND created_at <= $${params.length}`);
    }

    query.push(`ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`);
    params.push(limit, offset);

    const { rows } = await db.query(query.join(" "), params);
    res.json({ items: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch audit log");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
