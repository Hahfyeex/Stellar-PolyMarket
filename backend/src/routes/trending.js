const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

const CACHE_KEY = "trending:markets:24h";
const CACHE_TTL_SECONDS = 300; // 5 minutes
const TOP_N = 10;

/**
 * Queries the top N markets by total bet volume in the last 24 hours.
 * Uses an optimised GROUP BY on the bets table joined to markets.
 *
 * @param {Object} dbClient - pg-compatible query client
 * @returns {Promise<Array>} sorted array of market volume rows
 */
async function fetchTrendingMarkets(dbClient) {
  const result = await dbClient.query(
    `SELECT
       b.market_id,
       m.question,
       m.status,
       m.resolved,
       m.end_date,
       COUNT(b.id)::int          AS bet_count,
       COALESCE(SUM(b.amount), 0) AS volume_24h
     FROM bets b
     JOIN markets m ON m.id = b.market_id
     WHERE b.created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY b.market_id, m.question, m.status, m.resolved, m.end_date
     ORDER BY volume_24h DESC
     LIMIT $1`,
    [TOP_N]
  );
  return result.rows;
}

/**
 * Sorts an array of market rows by volume_24h descending.
 * Kept as a pure function so it can be unit-tested in isolation.
 *
 * @param {Array} markets
 * @returns {Array} new sorted array
 */
function sortByVolume(markets) {
  return [...markets].sort(
    (a, b) => parseFloat(b.volume_24h) - parseFloat(a.volume_24h)
  );
}

/**
 * GET /api/markets/trending
 * Returns the top 10 markets by trading volume in the last 24 hours.
 * Response is cached in Redis for 5 minutes.
 */
router.get("/", async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      logger.debug({ cache_key: CACHE_KEY }, "Trending markets served from cache");
      return res.json({ ...JSON.parse(cached), cached: true });
    }

    const rows = await fetchTrendingMarkets(db);
    const markets = sortByVolume(rows);

    const payload = {
      fetched_at: new Date().toISOString(),
      cached: false,
      count: markets.length,
      markets,
    };

    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);

    logger.info(
      { count: markets.length, cache_ttl: CACHE_TTL_SECONDS },
      "Trending markets fetched and cached"
    );

    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Failed to fetch trending markets");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.sortByVolume = sortByVolume;
module.exports.fetchTrendingMarkets = fetchTrendingMarkets;
module.exports.CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
module.exports.TOP_N = TOP_N;
