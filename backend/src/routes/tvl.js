"use strict";

const express = require("express");
const router = express.Router();
const { registry, collectTVL } = require("../services/tvlService");
const logger = require("../utils/logger");

/**
 * GET /api/tvl
 * Returns current TVL for the frontend dashboard.
 * Always queries the DB directly so the response is never stale.
 */
router.get("/", async (req, res) => {
  try {
    const { total, markets } = await collectTVL();
    res.json({
      total_xlm: total,
      market_count: markets.length,
      markets,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch TVL");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
