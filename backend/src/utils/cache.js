"use strict";
/**
 * cache.js — Cache-aside helpers for market queries.
 *
 * Key namespacing:
 *   markets:list:{limit}:{offset}   — paginated market list (TTL: 30s)
 *   markets:id:{id}                 — single market + bets (TTL: 15s)
 *
 * Pattern: cache-aside
 *   1. Check Redis for cached value.
 *   2. On hit  → return parsed JSON immediately.
 *   3. On miss → run dbFn(), store result with TTL, return result.
 *   4. On Redis error → log warning, fall through to dbFn() (no crash).
 *
 * Invalidation:
 *   invalidateMarketList()   — DEL all markets:list:* keys (scan-based)
 *   invalidateMarket(id)     — DEL markets:id:{id}
 *   invalidateAll(id)        — both of the above (used on create/resolve)
 */

const redis = require("./redis");
const logger = require("./logger");

/** TTLs in seconds */
const TTL = {
  LIST:   30,
  DETAIL: 15,
};

/**
 * Build the cache key for the market list endpoint.
 * @param {number} limit
 * @param {number} offset
 * @returns {string}
 */
function listKey(limit, offset) {
  return `markets:list:${limit}:${offset}`;
}

/**
 * Build the cache key for a single market.
 * @param {string|number} id
 * @returns {string}
 */
function detailKey(id) {
  return `markets:id:${id}`;
}

/**
 * Cache-aside get-or-set.
 *
 * @param {string}   key    - Redis cache key
 * @param {number}   ttl    - TTL in seconds
 * @param {Function} dbFn   - Async function that returns the value on cache miss
 * @returns {Promise<any>}  - Parsed cached value or fresh value from dbFn
 */
async function getOrSet(key, ttl, dbFn) {
  // ── Cache check ────────────────────────────────────────────────────────────
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      logger.debug({ key }, "[Cache] HIT");
      return JSON.parse(cached);
    }
    logger.debug({ key }, "[Cache] MISS");
  } catch (err) {
    // Redis unavailable — fall through to DB without crashing
    logger.warn({ key, err: err.message }, "[Cache] Redis GET failed, falling back to DB");
  }

  // ── DB fetch ───────────────────────────────────────────────────────────────
  const value = await dbFn();

  // ── Store in cache (best-effort — never block the response) ───────────────
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
    logger.debug({ key, ttl }, "[Cache] SET");
  } catch (err) {
    logger.warn({ key, err: err.message }, "[Cache] Redis SET failed");
  }

  return value;
}

/**
 * Invalidate the market list cache.
 * Uses SCAN to find all matching keys so we don't need to track every
 * limit/offset combination explicitly.
 *
 * @returns {Promise<void>}
 */
async function invalidateMarketList() {
  try {
    // SCAN is non-blocking and safe in production (unlike KEYS)
    const keys = await scanKeys("markets:list:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug({ count: keys.length }, "[Cache] Invalidated market list keys");
    }
  } catch (err) {
    logger.warn({ err: err.message }, "[Cache] Failed to invalidate market list cache");
  }
}

/**
 * Invalidate the cache for a single market.
 * @param {string|number} id
 * @returns {Promise<void>}
 */
async function invalidateMarket(id) {
  try {
    await redis.del(detailKey(id));
    logger.debug({ id }, "[Cache] Invalidated market detail key");
  } catch (err) {
    logger.warn({ id, err: err.message }, "[Cache] Failed to invalidate market detail cache");
  }
}

/**
 * Invalidate both the list cache and a specific market's detail cache.
 * Called on market creation and resolution.
 * @param {string|number} [id] - Market id (optional; omit to only clear list)
 * @returns {Promise<void>}
 */
async function invalidateAll(id) {
  await Promise.all([
    invalidateMarketList(),
    id !== undefined ? invalidateMarket(id) : Promise.resolve(),
  ]);
}

/**
 * Scan Redis for all keys matching a glob pattern.
 * Uses cursor-based SCAN to avoid blocking the server.
 * @param {string} pattern
 * @returns {Promise<string[]>}
 */
async function scanKeys(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== "0");
  return keys;
}

module.exports = {
  getOrSet,
  invalidateMarketList,
  invalidateMarket,
  invalidateAll,
  listKey,
  detailKey,
  TTL,
  // exported for tests
  scanKeys,
};
