"use strict";

const { Pool } = require("pg");
const logger = require("./utils/logger");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Pool stats ────────────────────────────────────────────────────────────────
const stats = { total: 0, idle: 0, waiting: 0 };

// Track when waiting count first exceeded the alert threshold
let _waitingExceededAt = null;
const WAITING_ALERT_THRESHOLD = 10;
const WAITING_ALERT_DURATION_MS = 30_000;

function _syncStats() {
  stats.total = pool.totalCount;
  stats.idle = pool.idleCount;
  stats.waiting = pool.waitingCount;

  if (stats.waiting > WAITING_ALERT_THRESHOLD) {
    if (!_waitingExceededAt) _waitingExceededAt = Date.now();
    else if (Date.now() - _waitingExceededAt >= WAITING_ALERT_DURATION_MS) {
      logger.error(
        { waiting: stats.waiting },
        "[DB Pool] CRITICAL: waiting requests exceeded threshold for 30s"
      );
      _waitingExceededAt = Date.now(); // reset so we don't spam every event
    }
  } else {
    _waitingExceededAt = null;
  }
}

pool.on("connect", _syncStats);
pool.on("acquire", _syncStats);
pool.on("remove", _syncStats);
pool.on("error", (err) => {
  logger.error({ err: err.message }, "[DB Pool] Client error");
  _syncStats();
});

// ── Prometheus gauges ─────────────────────────────────────────────────────────
// Register on the same registry used by the /metrics scrape endpoint (tvlService)
try {
  const client = require("prom-client");
  const { registry } = require("./services/tvlService");

  const makeGauge = (name, help, fn) => {
    const g = new client.Gauge({
      name,
      help,
      registers: [registry],
      collect() {
        this.set(fn());
      },
    });
    return g;
  };

  makeGauge("db_pool_total", "Total DB pool connections", () => stats.total);
  makeGauge("db_pool_idle", "Idle DB pool connections", () => stats.idle);
  makeGauge("db_pool_waiting", "Requests waiting for a DB connection", () => stats.waiting);
} catch {
  // Graceful degradation: if prom-client or registry unavailable, skip gauge registration
}

module.exports = pool;
module.exports._stats = stats;
module.exports._syncStats = _syncStats;
