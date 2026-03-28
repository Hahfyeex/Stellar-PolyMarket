"use strict";
const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

const CACHE_KEY = "reserves:total";
const CACHE_TTL_SECONDS = 60;

// GET /api/reserves
// Returns the total locked value (sum of total_pool) across all active markets.
// Response is cached in Redis for 60 seconds.
router.get("/", async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      logger.debug("Reserves total served from cache");
      return res.json({ ...JSON.parse(cached), cached: true });
    }

    const result = await db.query(
      "SELECT COALESCE(SUM(total_pool::numeric), 0) AS total_locked FROM markets WHERE resolved = FALSE"
    );

    const payload = {
      total_locked: result.rows[0].total_locked,
      cached: false,
    };

    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
    logger.info({ total_locked: payload.total_locked }, "Reserves total fetched from DB");
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Failed to fetch reserves total");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reserves/:marketId
// Returns the locked pool balance for a specific market.
router.get("/:marketId", async (req, res) => {
  const { marketId } = req.params;

  try {
    const result = await db.query(
      "SELECT id, total_pool, resolved FROM markets WHERE id = $1",
      [marketId]
    );

    if (!result.rows.length) {
      logger.warn({ market_id: marketId }, "Market not found for reserves lookup");
      return res.status(404).json({ error: "Market not found" });
    }

    const market = result.rows[0];
    logger.debug({ market_id: marketId }, "Market reserves fetched");
    res.json({
      market_id: market.id,
      total_pool: market.total_pool,
      resolved: market.resolved,
    });
  } catch (err) {
    logger.error({ err, market_id: marketId }, "Failed to fetch market reserves");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
