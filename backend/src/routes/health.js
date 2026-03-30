"use strict";
/**
 * Health and Readiness endpoints.
 *
 * GET /health  — liveness probe
 *   Checks: PostgreSQL (SELECT 1) + Redis (PING)
 *   200 → { status: "healthy",   db: "ok",    redis: "ok",    uptime: N }
 *   503 → { status: "unhealthy", db: "error", redis: "ok",    error: "dependency unavailable" }
 *
 * GET /ready   — readiness probe
 *   All liveness checks PLUS a migration version check.
 *   200 → { status: "ready",    db: "ok", redis: "ok", migrations: "ok",    uptime: N }
 *   503 → { status: "not ready", ...,                  migrations: "error", error: "dependency unavailable" }
 *
 * Security:
 *   Internal error messages and stack traces are NEVER included in the
 *   response body. Only the generic string "dependency unavailable" is
 *   returned to callers. Full errors are logged server-side only.
 *
 * Timeout:
 *   Each dependency check races against a 1.5-second timeout so the
 *   combined endpoint always responds within 2 seconds.
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

/** Per-dependency timeout in milliseconds */
const CHECK_TIMEOUT_MS = 1500;

/**
 * Race a promise against a timeout.
 * Rejects with a timeout error if the promise does not settle in time.
 *
 * @param {Promise<any>} promise
 * @param {number}       ms
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("check timed out")), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Check PostgreSQL connectivity with SELECT 1.
 * @returns {Promise<"ok"|"error">}
 */
async function checkDb() {
  try {
    await withTimeout(db.query("SELECT 1"), CHECK_TIMEOUT_MS);
    return "ok";
  } catch (err) {
    // Log full error server-side; never expose to caller
    logger.error({ err: err.message }, "[Health] DB check failed");
    return "error";
  }
}

/**
 * Check Redis connectivity with PING.
 * @returns {Promise<"ok"|"error">}
 */
async function checkRedis() {
  try {
    const pong = await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
    if (pong !== "PONG") throw new Error(`unexpected PING response: ${pong}`);
    return "ok";
  } catch (err) {
    logger.error({ err: err.message }, "[Health] Redis check failed");
    return "error";
  }
}

/**
 * Check that database migrations are up to date.
 * Queries the migrations table for the latest applied version and compares
 * it against the expected version stored in EXPECTED_MIGRATION_VERSION env var.
 *
 * Falls back to "ok" if no migration tracking table exists (permissive for
 * projects that don't use a migration runner yet).
 *
 * @returns {Promise<"ok"|"error">}
 */
async function checkMigrations() {
  try {
    // Query the schema_migrations table (standard for most migration tools).
    // If the table doesn't exist, treat as ok (no migration runner configured).
    const result = await withTimeout(
      db.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"),
      CHECK_TIMEOUT_MS
    );

    const expected = process.env.EXPECTED_MIGRATION_VERSION;
    if (!expected) return "ok"; // no version pinned — skip check

    const latest = result.rows[0]?.version;
    if (latest !== expected) {
      logger.warn({ latest, expected }, "[Health] Migration version mismatch");
      return "error";
    }
    return "ok";
  } catch (err) {
    // Table doesn't exist or query failed — treat as ok unless explicitly required
    if (err.message?.includes("does not exist")) return "ok";
    logger.error({ err: err.message }, "[Health] Migration check failed");
    return "error";
  }
}

// ── GET /health — liveness probe ─────────────────────────────────────────────

router.get("/health", async (_req, res) => {
  const [dbStatus, redisStatus] = await Promise.all([checkDb(), checkRedis()]);

  const healthy = dbStatus === "ok" && redisStatus === "ok";
  const statusCode = healthy ? 200 : 503;

  const body = {
    status: healthy ? "healthy" : "unhealthy",
    db: dbStatus,
    redis: redisStatus,
    uptime: Math.floor(process.uptime()),
    // Generic error string — never expose internal details
    ...(healthy ? {} : { error: "dependency unavailable" }),
  };

  logger.debug(body, "[Health] /health");
  return res.status(statusCode).json(body);
});

// ── GET /ready — readiness probe ──────────────────────────────────────────────

router.get("/ready", async (_req, res) => {
  const [dbStatus, redisStatus, migrationsStatus] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkMigrations(),
  ]);

  const ready = dbStatus === "ok" && redisStatus === "ok" && migrationsStatus === "ok";
  const statusCode = ready ? 200 : 503;

  const body = {
    status: ready ? "ready" : "not ready",
    db: dbStatus,
    redis: redisStatus,
    migrations: migrationsStatus,
    uptime: Math.floor(process.uptime()),
    ...(ready ? {} : { error: "dependency unavailable" }),
  };

  logger.debug(body, "[Health] /ready");
  return res.status(statusCode).json(body);
});

// ── GET /health/db — pool stats ───────────────────────────────────────────────

router.get("/health/db", (_req, res) => {
  const { _stats } = require("../db");
  res.json({
    status: "ok",
    pool: { total: _stats.total, idle: _stats.idle, waiting: _stats.waiting },
  });
});

// ── GET /api/health/oracle — oracle connectivity ping (#587) ──────────────────
router.get("/api/health/oracle", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = router;
// Export helpers for unit testing
module.exports._checkDb = checkDb;
module.exports._checkRedis = checkRedis;
module.exports._checkMigrations = checkMigrations;
module.exports._withTimeout = withTimeout;
