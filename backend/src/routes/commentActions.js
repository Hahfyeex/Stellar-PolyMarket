"use strict";

const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");
const jwtAuth = require("../middleware/jwtAuth");

// POST /api/comments/:id/thumbs-up  (JWT required, one per wallet)
router.post("/:id/thumbs-up", jwtAuth, async (req, res) => {
  const commentId = parseInt(req.params.id, 10);
  const walletAddress = req.admin?.sub || req.admin?.wallet_address;

  try {
    // Insert deduplication record — PK constraint prevents duplicates
    await db.query("INSERT INTO comment_thumbs_up (comment_id, wallet_address) VALUES ($1, $2)", [
      commentId,
      walletAddress,
    ]);

    const { rows } = await db.query(
      "UPDATE market_comments SET thumbs_up_count = thumbs_up_count + 1 WHERE id = $1 RETURNING thumbs_up_count",
      [commentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.json({ thumbs_up_count: rows[0].thumbs_up_count });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Already thumbed up" });
    }
    if (err.code === "23503") {
      return res.status(404).json({ error: "Comment not found" });
    }
    logger.error({ err: err.message, commentId }, "Failed to thumbs-up comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/comments/:id  (admin JWT required — sets is_hidden = TRUE)
router.delete("/:id", jwtAuth, async (req, res) => {
  const commentId = parseInt(req.params.id, 10);

  // Require admin role
  if (!req.admin?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const { rows } = await db.query(
      "UPDATE market_comments SET is_hidden = TRUE WHERE id = $1 RETURNING id",
      [commentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message, commentId }, "Failed to hide comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
