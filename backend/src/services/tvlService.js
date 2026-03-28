"use strict";

const client = require("prom-client");
const db = require("../db");
const logger = require("../utils/logger");

// ── Prometheus registry ───────────────────────────────────────────────────
// Use a dedicated registry (not the global default) so tests can reset it
// cleanly without affecting other metrics in the process.
const registry = new client.Registry();

// Collect default Node.js metrics (memory, CPU, event loop lag) into our registry
client.collectDefaultMetrics({ register: registry });

/**
 * tvl_total_xlm — total XLM locked across all active markets.
 * Updated every SCRAPE_INTERVAL_MS by the background poller.
 */
const tvlTotalGauge = new client.Gauge({
  name: "tvl_total_xlm",
  help: "Total Value Locked across all active markets (XLM stroops)",
  registers: [registry],
});

/**
 * tvl_per_market — per-market pool balance.
 * Label: market_id — allows Prometheus to track individual market health
 * and alert on sudden drops in a single market's pool.
 */
const tvlPerMarketGauge = new client.Gauge({
  name: "tvl_per_market",
  help: "Pool balance for a single active market (XLM stroops)",
  labelNames: ["market_id"],
  registers: [registry],
});

// Scrape interval: 30 seconds (configurable via env for testing)
const SCRAPE_INTERVAL_MS = Number(process.env.TVL_SCRAPE_INTERVAL_MS) || 30_000;

let _timer = null;

/**
 * Query all active (unresolved) markets, sum their total_pool values,
 * and update both Prometheus gauges.
 *
 * Called by the background poller and directly by the /api/tvl endpoint
 * so the REST response always reflects the latest DB state.
 *
 * @returns {Promise<{ total: number, markets: Array<{id, total_pool}> }>}
 */
async function collectTVL() {
  const result = await db.query(
    "SELECT id, total_pool FROM markets WHERE resolved = FALSE"
  );

  const markets = result.rows.map((r) => ({
    id: String(r.id),
    total_pool: parseFloat(r.total_pool) || 0,
  }));

  // Sum all active pool balances for the aggregate gauge
  const total = markets.reduce((sum, m) => sum + m.total_pool, 0);

  tvlTotalGauge.set(total);

  // Reset per-market gauge before re-setting so stale market_ids are removed
  tvlPerMarketGauge.reset();
  for (const m of markets) {
    tvlPerMarketGauge.set({ market_id: m.id }, m.total_pool);
  }

  logger.info({ total_xlm: total, market_count: markets.length }, "[TVL] Gauges updated");

  return { total, markets };
}

/**
 * Start the background poller. Safe to call multiple times — only one
 * timer runs at a time.
 */
function startPoller() {
  if (_timer) return;
  // Run immediately on start, then on interval
  collectTVL().catch((err) => logger.error({ err }, "[TVL] Initial scrape failed"));
  _timer = setInterval(() => {
    collectTVL().catch((err) => logger.error({ err }, "[TVL] Scrape failed"));
  }, SCRAPE_INTERVAL_MS);
  // Don't block process exit
  if (_timer.unref) _timer.unref();
  logger.info({ interval_ms: SCRAPE_INTERVAL_MS }, "[TVL] Poller started");
}

/** Stop the background poller (used in tests / graceful shutdown). */
function stopPoller() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { registry, collectTVL, startPoller, stopPoller, tvlTotalGauge, tvlPerMarketGauge };
