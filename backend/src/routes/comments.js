"use strict";

const express = require("express");
const router = express.Router({ mergeParams: true });
const db = require("../db");
const logger = require("../utils/logger");
const jwtAuth = require("../middleware/jwtAuth");

const PAGE_SIZE = 20;

// GET /api/markets/:id/comments?page=0
router.get("/", async (req, res) => {
  const marketId = parseInt(req.params.id, 10);
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const offset = page * PAGE_SIZE;

  try {
    const { rows } = await db.query(
      `SELECT id, market_id, wallet_address, content, thumbs_up_count, created_at
       FROM market_comments
       WHERE market_id = $1 AND is_hidden = FALSE
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [marketId, PAGE_SIZE, offset]
    );

    const countResult = await db.query(
      "SELECT COUNT(*) AS total FROM market_comments WHERE market_id = $1 AND is_hidden = FALSE",
      [marketId]
    );
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({ comments: rows, meta: { page, pageSize: PAGE_SIZE, total } });
  } catch (err) {
    logger.error({ err: err.message, marketId }, "Failed to fetch comments");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/markets/:id/comments  (JWT required)
router.post("/", jwtAuth, async (req, res) => {
  const marketId = parseInt(req.params.id, 10);
  const walletAddress = req.admin?.sub || req.admin?.wallet_address;
  const { content } = req.body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return res.status(400).json({ error: "content is required" });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: "content must be 500 characters or fewer" });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO market_comments (market_id, wallet_address, content)
       VALUES ($1, $2, $3)
       RETURNING id, market_id, wallet_address, content, thumbs_up_count, created_at`,
      [marketId, walletAddress, content.trim()]
    );
    res.status(201).json({ comment: rows[0] });
  } catch (err) {
    logger.error({ err: err.message, marketId }, "Failed to create comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
