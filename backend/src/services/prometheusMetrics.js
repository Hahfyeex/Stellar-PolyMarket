"use strict";

/**
 * Prometheus Metrics Registry
 *
 * Exposes protocol health data as labeled gauges.
 * All monetary gauges use integer stroop values (i128-compatible) to avoid
 * floating-point imprecision in time-series storage.
 */

const client = require("prom-client");

// Use a dedicated registry so we don't pollute the default global one
const registry = new client.Registry();

// ─── Default process metrics ────────────────────────────────────────────────
client.collectDefaultMetrics({ register: registry, prefix: "stella_" });

// ─── Protocol-specific gauges ────────────────────────────────────────────────

const tvlGauge = new client.Gauge({
  name: "stella_protocol_tvl_stroops",
  help: "Total Value Locked in the protocol, denominated in stroops (1 XLM = 10,000,000 stroops). Integer — no floats.",
  registers: [registry],
});

const activeMarketsGauge = new client.Gauge({
  name: "stella_protocol_active_markets_total",
  help: "Number of currently open prediction markets.",
  registers: [registry],
});

const volume24hGauge = new client.Gauge({
  name: "stella_protocol_volume_24h_stroops",
  help: "24-hour rolling trading volume in stroops. Integer — no floats.",
  registers: [registry],
});

const totalStakedGauge = new client.Gauge({
  name: "stella_protocol_total_staked_stroops",
  help: "Total STELLA tokens staked, in stroops. Integer — no floats.",
  registers: [registry],
});

const stakingRatioGauge = new client.Gauge({
  name: "stella_protocol_staking_ratio_fixed",
  help: "Staking ratio as a 7-decimal fixed-point integer (e.g. 4235000 = 42.35000%). No floats.",
  registers: [registry],
});

const cacheHitCounter = new client.Counter({
  name: "stella_health_cache_hits_total",
  help: "Number of times the health endpoint was served from Redis cache.",
  registers: [registry],
});

const cacheMissCounter = new client.Counter({
  name: "stella_health_cache_misses_total",
  help: "Number of times the health endpoint required a fresh DB query.",
  registers: [registry],
});

/**
 * Update all protocol gauges from a metrics snapshot.
 * Accepts the object returned by protocolHealthService.getProtocolHealth().
 * @param {object} metrics
 */
function updateGauges(metrics) {
  // Parse i128-safe strings back to Number for prom-client.
  // These are stroop integers — they fit safely in IEEE 754 double for realistic TVLs.
  tvlGauge.set(Number(metrics.tvl_stroops));
  activeMarketsGauge.set(Number(metrics.active_markets));
  volume24hGauge.set(Number(metrics.volume_24h_stroops));
  totalStakedGauge.set(Number(metrics.total_staked_stroops));
  stakingRatioGauge.set(Number(metrics.staking_ratio_fixed));

  if (metrics.cached) {
    cacheHitCounter.inc();
  } else {
    cacheMissCounter.inc();
  }
}

module.exports = { registry, updateGauges };
