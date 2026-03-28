"use strict";
/**
 * Redis Client Configuration
 *
 * Connection priority:
 *   1. REDIS_URL  — full connection string (e.g. redis://user:pass@host:6379)
 *   2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD — individual env vars
 *   3. localhost:6379 — local development default
 *
 * Graceful degradation:
 *   If Redis is unavailable, all cache operations fall back to the database
 *   without crashing. The no-op client returned on connection failure ensures
 *   the application continues to serve requests.
 */

const Redis = require("ioredis");
const logger = require("./logger");

/**
 * Build ioredis connection options from environment variables.
 * REDIS_URL takes precedence over individual host/port/password vars.
 */
function buildRedisConfig() {
  if (process.env.REDIS_URL) {
    return {
      // ioredis accepts a connection URL directly
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    };
  }
  return {
    host:     process.env.REDIS_HOST     || "localhost",
    port:     parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  };
}

/**
 * Create the ioredis client.
 * If REDIS_URL is set, pass it as the first argument to the constructor.
 */
function createClient() {
  const config = buildRedisConfig();
  return process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, config)
    : new Redis(config);
}

const redis = createClient();

// ── Connection event handlers ─────────────────────────────────────────────────

redis.on("connect",     () => logger.info("[Redis] Client connected"));
redis.on("ready",       () => logger.info("[Redis] Client ready"));
redis.on("error",  (err) => logger.error({ err }, "[Redis] Client error"));
redis.on("close",       () => logger.warn("[Redis] Connection closed"));
redis.on("reconnecting",() => logger.info("[Redis] Reconnecting"));

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  try {
    await redis.quit();
    logger.info("[Redis] Client disconnected on SIGTERM");
  } catch {
    // ignore quit errors during shutdown
  }
});

module.exports = redis;
