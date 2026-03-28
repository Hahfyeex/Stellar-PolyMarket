const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const jwtAuth = require("../middleware/jwtAuth");
const logger = require("../utils/logger");

const CACHE_TTL = 300; // 5 minutes

const VALID_PERIODS = ["1d", "7d", "30d", "all"];
const VALID_GRANULARITIES = ["hour", "day", "week"];

const PERIOD_INTERVALS = { "1d": "1 day", "7d": "7 days", "30d": "30 days" };

function buildVolumeQuery(period, granularity) {
  const interval = PERIOD_INTERVALS[period];
  const whereClause = interval
    ? `WHERE created_at >= NOW() - INTERVAL '${interval}'`
    : "";
  return `
    SELECT
      DATE_TRUNC('${granularity}', created_at) AS period,
      SUM(amount)                               AS volume,
      COUNT(*)::int                             AS bet_count
    FROM bets
    ${whereClause}
    GROUP BY period
    ORDER BY period ASC
  `;
}

// GET /api/analytics/volume?period=7d&granularity=day
router.get("/volume", jwtAuth, async (req, res) => {
  const period = req.query.period || "7d";
  const granularity = req.query.granularity || "day";

  if (!VALID_PERIODS.includes(period)) {
    return res.status(400).json({ error: `period must be one of: ${VALID_PERIODS.join(", ")}` });
  }
  if (!VALID_GRANULARITIES.includes(granularity)) {
    return res.status(400).json({ error: `granularity must be one of: ${VALID_GRANULARITIES.join(", ")}` });
  }

  const cacheKey = `analytics:volume:${period}:${granularity}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ ...JSON.parse(cached), cached: true });

    const { rows } = await db.query(buildVolumeQuery(period, granularity));

    const payload = { period, granularity, data: rows, cached: false };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);

    logger.info({ period, granularity, rows: rows.length }, "Analytics volume fetched");
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Analytics volume query failed");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/top-markets?limit=10
router.get("/top-markets", jwtAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const cacheKey = `analytics:top-markets:${limit}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ ...JSON.parse(cached), cached: true });

    const { rows } = await db.query(
      `SELECT id, question, status, total_pool, resolved, end_date
       FROM markets
       ORDER BY total_pool DESC
       LIMIT $1`,
      [limit]
    );

    const payload = { limit, markets: rows, cached: false };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);

    logger.info({ limit, count: rows.length }, "Top markets fetched");
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Top markets query failed");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.buildVolumeQuery = buildVolumeQuery;
module.exports.VALID_PERIODS = VALID_PERIODS;
module.exports.VALID_GRANULARITIES = VALID_GRANULARITIES;
module.exports.CACHE_TTL = CACHE_TTL;
