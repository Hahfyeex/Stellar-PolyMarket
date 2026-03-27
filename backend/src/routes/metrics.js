"use strict";

const express = require("express");
const router = express.Router();
const { registry } = require("../services/tvlService");

/**
 * GET /metrics
 * Prometheus scrape endpoint — returns all registered metrics in text/plain
 * exposition format. Intentionally NOT behind App Check so Prometheus can
 * scrape without a Firebase token.
 *
 * Metric names:
 *   tvl_total_xlm          — aggregate TVL across all active markets
 *   tvl_per_market{market_id} — per-market pool balance
 *   + default Node.js process metrics (memory, CPU, event loop)
 */
router.get("/", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

module.exports = router;
