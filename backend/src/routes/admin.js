/**
 * routes/admin.js
 *
 * Admin-only endpoints for platform management and monitoring.
 * All routes require a valid JWT with admin role (see middleware/jwtAuth.js).
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const jwtAuth = require("../middleware/jwtAuth");
const logger = require("../utils/logger");
const { sanitizeError } = require("../utils/errors");

/**
 * Middleware to check admin role.
 * Assumes JWT payload has an 'admin' or 'role' field.
 */
function requireAdmin(req, res, next) {
  if (!req.admin || (req.admin.role !== "admin" && !req.admin.admin)) {
    return res.status(403).json({ error: "Admin role required" });
  }
  next();
}

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

// #418: GET /api/admin/stats — platform statistics
router.get("/stats", jwtAuth, requireAdmin, async (req, res) => {
  const cacheKey = "admin:stats";

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get total markets by status
    const marketsResult = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_markets,
        COUNT(*) FILTER (WHERE resolved = TRUE) as resolved_markets,
        COUNT(*) FILTER (WHERE status = 'VOIDED') as voided_markets,
        COUNT(*) as total_markets
       FROM markets WHERE deleted_at IS NULL`
    );

    // Get total bets and volume
    const betsResult = await db.query(
      `SELECT 
        COUNT(*) as total_bets,
        COALESCE(SUM(amount), 0) as total_volume_xlm
       FROM bets`
    );

    // Get unique wallets
    const walletsResult = await db.query(
      `SELECT COUNT(DISTINCT wallet_address) as unique_wallets FROM bets`
    );

    // Get 24h volume
    const volume24hResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as volume_24h
       FROM bets
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    const stats = {
      markets: {
        active: parseInt(marketsResult.rows[0].active_markets) || 0,
        resolved: parseInt(marketsResult.rows[0].resolved_markets) || 0,
        voided: parseInt(marketsResult.rows[0].voided_markets) || 0,
        total: parseInt(marketsResult.rows[0].total_markets) || 0,
      },
      bets: {
        total: parseInt(betsResult.rows[0].total_bets) || 0,
        total_volume_xlm: parseFloat(betsResult.rows[0].total_volume_xlm) || 0,
      },
      wallets: {
        unique: parseInt(walletsResult.rows[0].unique_wallets) || 0,
      },
      volume_24h: parseFloat(volume24hResult.rows[0].volume_24h) || 0,
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(stats), "EX", 5 * 60);

    logger.info(stats, "Admin stats retrieved");
    res.json(stats);
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch admin stats");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// #418: GET /api/admin/pending-review — markets pending review
router.get("/pending-review", jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM pending_review ORDER BY created_at DESC"
    );
    res.json({ items: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch pending review");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// #418: GET /api/admin/dead-letter — dead-lettered markets
router.get("/dead-letter", jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM dead_letter_queue ORDER BY created_at DESC"
    );
    res.json({ items: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch dead-letter queue");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// #418: POST /api/admin/markets/:id/force-resolve — manually resolve a market
router.post("/markets/:id/force-resolve", jwtAuth, requireAdmin, async (req, res) => {
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
      "FORCE_RESOLVE_MARKET",
      marketId,
      "MARKET",
      { winning_outcome },
      req
    );

    logger.info(
      { marketId, winning_outcome, admin: req.admin.sub },
      "Admin force-resolved market"
    );

    // Invalidate stats cache
    await redis.del("admin:stats");

    res.json({ success: true, market_id: marketId, winning_outcome });
  } catch (err) {
    logger.error({ err: err.message }, "Admin force-resolve failed");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// GET /api/admin/markets/deleted — list all soft-deleted markets for audit
router.get("/markets/deleted", jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM markets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    );
    res.json({ markets: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch deleted markets");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/admin/pending-review — add market to pending review queue
router.post("/pending-review", jwtAuth, requireAdmin, async (req, res) => {
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
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/admin/markets/:id/pending-confirmation — oracle sets high-value market to PENDING_CONFIRMATION
router.post("/markets/:id/pending-confirmation", async (req, res) => {
  const marketId = parseInt(req.params.id, 10);
  const { proposedOutcome, totalPool } = req.body;

  if (proposedOutcome === undefined || proposedOutcome === null || !Number.isInteger(proposedOutcome)) {
    return res.status(400).json({ error: "proposedOutcome must be an integer" });
  }

  try {
    const { rows } = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);
    if (!rows.length) return res.status(404).json({ error: "Market not found" });

    await db.query(
      `UPDATE markets SET status = 'PENDING_CONFIRMATION', proposed_outcome = $1 WHERE id = $2`,
      [proposedOutcome, marketId]
    );

    logger.info({ marketId, proposedOutcome, totalPool }, "Market set to PENDING_CONFIRMATION");
    res.json({ success: true, market_id: marketId, proposed_outcome: proposedOutcome });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to set pending confirmation");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/admin/markets/:id/confirm-resolution — admin finalizes a PENDING_CONFIRMATION market
router.post("/markets/:id/confirm-resolution", jwtAuth, requireAdmin, async (req, res) => {
  const marketId = parseInt(req.params.id, 10);

  try {
    const { rows } = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);
    if (!rows.length) return res.status(404).json({ error: "Market not found" });

    const market = rows[0];
    if (market.status !== "PENDING_CONFIRMATION") {
      return res.status(409).json({ error: "Market is not in PENDING_CONFIRMATION status" });
    }
    if (market.proposed_outcome === null || market.proposed_outcome === undefined) {
      return res.status(409).json({ error: "No proposed outcome to confirm" });
    }

    await db.query(
      `UPDATE markets SET resolved = true, winning_outcome = $1, status = 'RESOLVED', proposed_outcome = NULL WHERE id = $2`,
      [market.proposed_outcome, marketId]
    );

    await logAdminAction(req.admin.sub, "CONFIRM_RESOLUTION", marketId, "MARKET", {
      winning_outcome: market.proposed_outcome,
    }, req);

    logger.info({ marketId, winning_outcome: market.proposed_outcome, admin: req.admin.sub }, "Admin confirmed high-value resolution");
    await redis.del("admin:stats");

    res.json({ success: true, market_id: marketId, winning_outcome: market.proposed_outcome });
  } catch (err) {
    logger.error({ err: err.message }, "Admin confirm-resolution failed");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/admin/markets/:id/reject-resolution — admin rejects and returns market to ACTIVE
router.post("/markets/:id/reject-resolution", jwtAuth, requireAdmin, async (req, res) => {
  const marketId = parseInt(req.params.id, 10);

  try {
    const { rows } = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);
    if (!rows.length) return res.status(404).json({ error: "Market not found" });

    if (rows[0].status !== "PENDING_CONFIRMATION") {
      return res.status(409).json({ error: "Market is not in PENDING_CONFIRMATION status" });
    }

    await db.query(
      `UPDATE markets SET status = 'ACTIVE', proposed_outcome = NULL WHERE id = $1`,
      [marketId]
    );

    await logAdminAction(req.admin.sub, "REJECT_RESOLUTION", marketId, "MARKET", {}, req);

    logger.info({ marketId, admin: req.admin.sub }, "Admin rejected high-value resolution");

    res.json({ success: true, market_id: marketId });
  } catch (err) {
    logger.error({ err: err.message }, "Admin reject-resolution failed");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/admin/markets/:id/resolve — legacy endpoint for backward compatibility
router.post("/markets/:id/resolve", jwtAuth, requireAdmin, async (req, res) => {  const marketId = parseInt(req.params.id, 10);
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
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// GET /api/admin/audit-log
router.get("/audit-log", jwtAuth, requireAdmin, async (req, res) => {
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

    params.push(limit, offset);
    query.push(`ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`);

    const { rows } = await db.query(query.join(" "), params);
    res.json({ items: rows });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch audit log");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

module.exports = router;
