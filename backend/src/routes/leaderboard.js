/**
 * routes/leaderboard.js
 *
 * #420: Leaderboard API endpoints.
 * Ranks users by prediction accuracy, total volume, or total winnings.
 * Results are cached in Redis for 5 minutes.
 */

"use strict";

const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
const { sanitizeError } = require("../utils/errors");

const CACHE_TTL = 5 * 60; // 5 minutes
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * GET /api/leaderboard
 * Query params:
 *   - type: 'accuracy' | 'volume' | 'winnings' (default: 'accuracy')
 *   - limit: number (default: 25, max: 100)
 *   - offset: number (default: 0)
 */
router.get("/", async (req, res) => {
  const type = req.query.type || "accuracy";
  const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseInt(req.query.offset) || 0;

  // Validate type
  if (!["accuracy", "volume", "winnings"].includes(type)) {
    return res.status(400).json({
      error: "type must be one of: accuracy, volume, winnings",
    });
  }

  const cacheKey = `leaderboard:${type}:${limit}:${offset}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ type, limit, offset }, "Leaderboard from cache");
      return res.json(JSON.parse(cached));
    }

    let query;
    let params = [limit, offset];

    if (type === "accuracy") {
      query = `
        SELECT 
          wallet_address,
          COUNT(*) as total_bets,
          SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) as wins,
          ROUND(
            SUM(CASE WHEN paid_out THEN 1 ELSE 0 END)::numeric / 
            NULLIF(COUNT(*), 0) * 100, 
            2
          ) as accuracy_pct
        FROM bets
        GROUP BY wallet_address
        HAVING COUNT(*) > 0
        ORDER BY accuracy_pct DESC, total_bets DESC
        LIMIT $1 OFFSET $2
      `;
    } else if (type === "volume") {
      query = `
        SELECT 
          wallet_address,
          COUNT(*) as total_bets,
          ROUND(SUM(amount)::numeric, 2) as total_volume_xlm
        FROM bets
        GROUP BY wallet_address
        ORDER BY total_volume_xlm DESC, total_bets DESC
        LIMIT $1 OFFSET $2
      `;
    } else if (type === "winnings") {
      query = `
        SELECT 
          b.wallet_address,
          COUNT(*) as total_bets,
          SUM(CASE WHEN b.paid_out THEN 1 ELSE 0 END) as wins,
          ROUND(
            SUM(CASE WHEN b.paid_out THEN b.amount ELSE 0 END)::numeric, 
            2
          ) as total_winnings_xlm
        FROM bets b
        GROUP BY b.wallet_address
        HAVING SUM(CASE WHEN b.paid_out THEN 1 ELSE 0 END) > 0
        ORDER BY total_winnings_xlm DESC, wins DESC
        LIMIT $1 OFFSET $2
      `;
    }

    const result = await db.query(query, params);
    const leaderboard = result.rows.map((row, index) => ({
      rank: offset + index + 1,
      ...row,
    }));

    const response = {
      type,
      leaderboard,
      limit,
      offset,
      count: leaderboard.length,
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL);

    logger.info(
      { type, limit, offset, count: leaderboard.length },
      "Leaderboard retrieved"
    );

    res.json(response);
  } catch (err) {
    logger.error({ err: err.message, type }, "Failed to fetch leaderboard");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

/**
 * GET /api/leaderboard/user/:walletAddress
 * Get a specific user's position on all leaderboards.
 */
router.get("/user/:walletAddress", async (req, res) => {
  const { walletAddress } = req.params;

  try {
    // Get accuracy rank
    const accuracyResult = await db.query(
      `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY accuracy_pct DESC, total_bets DESC) as rank,
        wallet_address,
        total_bets,
        wins,
        accuracy_pct
      FROM (
        SELECT 
          wallet_address,
          COUNT(*) as total_bets,
          SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) as wins,
          ROUND(
            SUM(CASE WHEN paid_out THEN 1 ELSE 0 END)::numeric / 
            NULLIF(COUNT(*), 0) * 100, 
            2
          ) as accuracy_pct
        FROM bets
        GROUP BY wallet_address
        HAVING COUNT(*) > 0
      ) ranked
      WHERE wallet_address = $1
      `,
      [walletAddress]
    );

    // Get volume rank
    const volumeResult = await db.query(
      `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY total_volume_xlm DESC, total_bets DESC) as rank,
        wallet_address,
        total_bets,
        total_volume_xlm
      FROM (
        SELECT 
          wallet_address,
          COUNT(*) as total_bets,
          ROUND(SUM(amount)::numeric, 2) as total_volume_xlm
        FROM bets
        GROUP BY wallet_address
      ) ranked
      WHERE wallet_address = $1
      `,
      [walletAddress]
    );

    // Get winnings rank
    const winningsResult = await db.query(
      `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY total_winnings_xlm DESC, wins DESC) as rank,
        wallet_address,
        total_bets,
        wins,
        total_winnings_xlm
      FROM (
        SELECT 
          wallet_address,
          COUNT(*) as total_bets,
          SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) as wins,
          ROUND(
            SUM(CASE WHEN paid_out THEN b.amount ELSE 0 END)::numeric, 
            2
          ) as total_winnings_xlm
        FROM bets b
        GROUP BY wallet_address
      ) ranked
      WHERE wallet_address = $1
      `,
      [walletAddress]
    );

    const response = {
      wallet_address: walletAddress,
      accuracy: accuracyResult.rows[0] || null,
      volume: volumeResult.rows[0] || null,
      winnings: winningsResult.rows[0] || null,
      timestamp: new Date().toISOString(),
    };

    logger.info({ walletAddress }, "User leaderboard position retrieved");
    res.json(response);
  } catch (err) {
    logger.error({ err: err.message, walletAddress }, "Failed to fetch user position");
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

module.exports = router;
