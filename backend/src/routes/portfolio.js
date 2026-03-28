const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

const CACHE_TTL = 60; // 60 seconds as per requirement

/**
 * GET /api/portfolio/:wallet
 * Returns a complete portfolio view for a wallet address.
 * Aggregates all positions, P&L, and statistics for a wallet in a single response.
 */
router.get("/:wallet", async (req, res) => {
  const { wallet } = req.params;

  // 1. Validate the wallet address format (56-char G-address)
  const stellarAddressRegex = /^G[A-Z2-7]{55}$/;
  if (!stellarAddressRegex.test(wallet)) {
    return res.status(400).json({ 
      error: "Invalid wallet address format. Must be a 56-character Stellar G-address." 
    });
  }

  const cacheKey = `portfolio:${wallet}`;

  try {
    // 2. Cache-aside: check Redis first
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      logger.debug({ wallet }, "Portfolio returned from cache");
      return res.json(JSON.parse(cachedData));
    }

    // 3. Single SQL query with JOINs to fetch all data
    // We use a CTE to first get all bets for the wallet joined with market data,
    // then aggregate in the main SELECT.
    const query = `
      WITH wallet_bets AS (
        SELECT 
          b.id as bet_id,
          b.market_id,
          b.outcome_index,
          b.amount,
          b.paid_out,
          b.created_at as bet_created_at,
          m.question,
          m.outcomes,
          m.resolved,
          m.winning_outcome,
          m.status as market_status
        FROM bets b
        JOIN markets m ON b.market_id = m.id
        WHERE b.wallet_address = $1
      ),
      summary_stats AS (
        SELECT
          COUNT(*) as total_bets,
          COUNT(DISTINCT market_id) as unique_markets,
          COALESCE(SUM(amount), 0) as total_invested,
          COALESCE(SUM(CASE WHEN resolved = TRUE AND outcome_index = winning_outcome THEN amount * 2 ELSE 0 END), 0) as total_payout, -- Placeholder: real payout calc depends on pool
          COALESCE(SUM(CASE WHEN resolved = TRUE AND outcome_index = winning_outcome THEN 1 ELSE 0 END), 0) as wins,
          COALESCE(COUNT(CASE WHEN resolved = TRUE THEN 1 END), 0) as resolved_bets
        FROM wallet_bets
      )
      SELECT json_build_object(
        'summary', (
          SELECT json_build_object(
            'total_invested', total_invested,
            'total_payout', total_payout,
            'total_p_and_l', total_payout - total_invested,
            'win_rate', CASE WHEN resolved_bets > 0 THEN wins::float / resolved_bets ELSE 0 END,
            'total_bets', total_bets,
            'unique_markets', unique_markets
          ) FROM summary_stats
        ),
        'recent_activity', COALESCE((
          SELECT json_agg(act) FROM (
            SELECT 
              bet_id,
              amount,
              outcome_index,
              outcomes[outcome_index + 1] as outcome_name,
              market_id,
              question as market_question,
              resolved as is_resolved,
              winning_outcome,
              CASE WHEN resolved = TRUE AND outcome_index = winning_outcome THEN amount * 2 ELSE 0 END as payout,
              bet_created_at as created_at
            FROM wallet_bets
            ORDER BY bet_created_at DESC
            LIMIT 15
          ) act
        ), '[]'::json)
      ) as data;
    `;

    const result = await db.query(query, [wallet]);
    const portfolio = result.rows[0].data;


    // 4. Cache the response in Redis
    await redis.set(cacheKey, JSON.stringify(portfolio), "EX", CACHE_TTL);
    logger.info({ wallet }, "Portfolio aggregated and cached");

    res.json(portfolio);
  } catch (err) {
    logger.error({ err, wallet }, "Failed to fetch portfolio");
    res.status(500).json({ error: "Failed to fetch portfolio data" });
  }
});

module.exports = router;
