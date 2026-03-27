/**
 * routes/archive.js
 *
 * GET /api/archive/markets
 *   - Requires X-Archive-Api-Key header (read-only)
 *   - Supports pagination: ?page=1&limit=20
 *   - Supports date-range filtering: ?from=ISO&to=ISO  (filters on archived_at)
 *   - Archive is read-only; all other methods return 405
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");
const archiveApiKey = require("../middleware/archiveApiKey");

// Block all non-GET methods
router.all("/markets", (req, res, next) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed. Archive is read-only." });
  }
  next();
});

// GET /api/archive/markets
router.get("/markets", archiveApiKey, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (req.query.from) {
    params.push(req.query.from);
    conditions.push(`archived_at >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    conditions.push(`archived_at <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await db.query(`SELECT COUNT(*) FROM archived_markets ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await db.query(
      `SELECT * FROM archived_markets ${where}
       ORDER BY archived_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    logger.debug({ page, limit, total, returned: result.rows.length }, "Archive markets fetched");

    res.json({
      markets: result.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to fetch archived markets");
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
