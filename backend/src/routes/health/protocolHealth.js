"use strict";

/**
 * Health Routes
 *
 * GET /api/health/protocol  — JSON protocol health snapshot (public, no auth)
 * GET /metrics              — Prometheus text exposition format
 */

const express = require("express");
const router = express.Router();

const { getProtocolHealth } = require("../../services/protocolHealthService");
const { registry, updateGauges } = require("../../services/prometheusMetrics");

// ─── GET /api/health/protocol ────────────────────────────────────────────────
router.get("/protocol", async (req, res) => {
  try {
    const metrics = await getProtocolHealth();

    // Keep Prometheus gauges in sync on every health request
    updateGauges(metrics);

    return res.status(200).json({
      status: "ok",
      data: {
        // Raw stroop integers (i128-compatible strings) — machine-readable
        tvl_stroops: metrics.tvl_stroops,
        active_markets: metrics.active_markets,
        volume_24h_stroops: metrics.volume_24h_stroops,
        total_staked_stroops: metrics.total_staked_stroops,
        staking_ratio_fixed: metrics.staking_ratio_fixed,

        // Human-readable 7-decimal fixed-point strings — no floats
        tvl_xlm: metrics.tvl_xlm,
        volume_24h_xlm: metrics.volume_24h_xlm,
        total_staked_xlm: metrics.total_staked_xlm,
        staking_ratio_pct: metrics.staking_ratio_pct,

        // Metadata
        cached: metrics.cached,
        fetched_at: metrics.fetched_at,
      },
    });
  } catch (err) {
    console.error("[Health] /protocol error:", err.message);
    return res.status(503).json({
      status: "error",
      message: "Unable to retrieve protocol health metrics.",
    });
  }
});

// ─── GET /metrics (Prometheus scrape endpoint) ───────────────────────────────
router.get("/prometheus-metrics", async (req, res) => {
  try {
    // Refresh gauges before exposing — ensures scrape always has fresh data
    const metrics = await getProtocolHealth();
    updateGauges(metrics);

    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    console.error("[Health] /metrics error:", err.message);
    res.status(503).end("# Error collecting metrics\n");
  }
});

module.exports = router;
