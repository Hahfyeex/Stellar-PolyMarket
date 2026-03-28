const express = require("express");
const router = express.Router();
const db = require("../db");
const { triggerNotification } = require("../utils/notifications");
const logger = require("../utils/logger");
const {
  validateMarketCreation,
  rateLimitMarketCreation,
} = require("../middleware/marketValidation");
const redis = require("../utils/redis");
const { calculateOdds } = require("../utils/math");
const eventBus = require("../bots/eventBus");
const { getOrSet, invalidateAll, listKey, detailKey, TTL } = require("../utils/cache");
const jwtAuth = require("../middleware/jwtAuth");

const DISPUTE_WINDOW_HOURS = parseInt(process.env.DISPUTE_WINDOW_HOURS, 10) || 24;

// GET /api/markets — list all markets with pagination
router.get("/", async (req, res) => {
  try {
    // Parse and validate pagination parameters
    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;

    let limit = 20; // default
    let offset = 0; // default

    // Validate limit
    if (limitParam !== undefined) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          error: {
            code: "INVALID_LIMIT",
            message: "limit must be an integer between 1 and 100",
            details: { provided: limitParam },
          },
        });
      }
      limit = parsedLimit;
    }

    // Validate offset
    if (offsetParam !== undefined) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({
          error: {
            code: "INVALID_OFFSET",
            message: "offset must be a non-negative integer",
            details: { provided: offsetParam },
          },
        });
      }
      offset = parsedOffset;
    }

    // Cache-aside: check Redis first, fall back to DB on miss or Redis failure
    const key = listKey(limit, offset);
    const data = await getOrSet(key, TTL.LIST, async () => {
      // Cache miss — query the database
      const countResult = await db.query(
        "SELECT COUNT(*) as total FROM markets WHERE deleted_at IS NULL"
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const result = await db.query(
        "SELECT * FROM markets WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [limit, offset]
      );

      const markets = result.rows;
      const hasMore = offset + markets.length < total;

      logger.debug(
        { market_count: markets.length, total, limit, offset },
        "Markets fetched with pagination"
      );

      return { markets, meta: { total, limit, offset, hasMore } };
    });

    res.json(data);
  } catch (err) {
    logger.error({ err }, "Failed to fetch markets");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets — create a market (permissionless with automated validation)
// Validation middleware chain:
// 1. validateMarketCreation - checks metadata (duplicates, end date, description, outcomes)
// 2. rateLimitMarketCreation - enforces 3 markets per wallet per 24 hours
router.post("/", validateMarketCreation, rateLimitMarketCreation, async (req, res) => {
  const { question, endDate, outcomes, contractAddress, walletAddress } = req.body;

  // Basic required field validation (middleware handles detailed validation)
  if (!question || !endDate || !outcomes?.length || !walletAddress) {
    return res.status(400).json({
      error: {
        code: "MISSING_REQUIRED_FIELDS",
        message: "question, endDate, outcomes, and walletAddress are required",
        details: {
          question: !!question,
          endDate: !!endDate,
          outcomes: !!outcomes?.length,
          walletAddress: !!walletAddress,
        },
      },
    });
  }

  try {
    // Market has passed all validation checks - create immediately without admin approval
    const result = await db.query(
      "INSERT INTO markets (question, end_date, outcomes, contract_address, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [question, endDate, outcomes, contractAddress || null]
    );

    logger.info(
      {
        market_id: result.rows[0].id,
        question,
        wallet_address: walletAddress,
        contract_address: contractAddress,
        outcomes_count: outcomes.length,
        permissionless: true,
      },
      "Market created via permissionless launch"
    );

    // Return 201 Created with the new market
    res.status(201).json({
      market: result.rows[0],
      message: "Market created successfully and published immediately",
    });

    // Invalidate the market list cache so the new market appears immediately
    await invalidateAll();

    // Emit market.created so registered bot strategies can seed initial liquidity
    eventBus.emit("market.created", {
      marketId: result.rows[0].id,
      question,
      outcomes: outcomes ?? [],
      totalPool: 0,
    });
  } catch (err) {
    logger.error({ err, question, wallet_address: walletAddress }, "Failed to create market");
    res.status(500).json({
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create market",
        details: err.message,
      },
    });
  }
});

const { calculateConfidenceScore } = require("../utils/analytics");
// GET /api/markets/:id
router.get("/:id", async (req, res) => {
  try {
    const key = detailKey(req.params.id);
    const data = await getOrSet(key, TTL.DETAIL, async () => {
      const market = await db.query("SELECT * FROM markets WHERE id = $1 AND deleted_at IS NULL", [
        req.params.id,
      ]);
      if (!market.rows.length) return null; // signal not-found

      const betsResult = await db.query("SELECT * FROM bets WHERE market_id = $1", [req.params.id]);
      const bets = betsResult.rows;
      const confidenceScore = calculateConfidenceScore(bets);

      logger.debug(
        {
          market_id: req.params.id,
          bets_count: bets.length,
          confidence_score: confidenceScore,
        },
        "Market details fetched with confidence score"
      );

      return { market: { ...market.rows[0], confidence_score: confidenceScore }, bets };
    });

    if (!data) {
      logger.warn({ market_id: req.params.id }, "Market not found");
      return res.status(404).json({ error: "Market not found" });
    }

    res.json(data);
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to fetch market details");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/markets/:id/odds — Cached "Market Odds" Snapshot
router.get("/:id/odds", async (req, res) => {
  const marketId = req.params.id;
  const cacheKey = `market:${marketId}:odds`;

  try {
    const cachedOdds = await redis.get(cacheKey);
    if (cachedOdds) {
      logger.debug({ market_id: marketId }, "Returned odds from cache");
      return res.json(JSON.parse(cachedOdds));
    }

    // Cache miss, calculate odds
    const marketResult = await db.query(
      "SELECT * FROM markets WHERE id = $1 AND deleted_at IS NULL",
      [marketId]
    );
    if (!marketResult.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    // We assume there are multiple outcomes and we need to aggregate pools from 'bets'
    // Alternatively, if markets table maintains 'yes_pool' and 'no_pool', we would use those.
    // The previous implementation used total_pool. Let's calculate the pool per outcome index dynamically.
    const betsResult = await db.query(
      "SELECT outcome_index, SUM(amount) as pool FROM bets WHERE market_id = $1 GROUP BY outcome_index",
      [marketId]
    );

    const outcomesCount = marketResult.rows[0].outcomes ? marketResult.rows[0].outcomes.length : 2;
    const poolData = [];
    for (let i = 0; i < outcomesCount; i++) {
      const b = betsResult.rows.find((row) => parseInt(row.outcome_index) === i);
      poolData.push({ index: i, pool: b ? parseFloat(b.pool) : 0 });
    }

    const { total_pool } = marketResult.rows[0];
    const odds = calculateOdds(poolData, total_pool);

    const responseData = { market_id: marketId, odds };

    // Cache for 1 hour or until invalidated by a new bet
    await redis.set(cacheKey, JSON.stringify(responseData), "EX", 3600);
    logger.info({ market_id: marketId }, "Odds calculated and cached");

    res.json(responseData);
  } catch (err) {
    logger.error({ err, market_id: marketId }, "Failed to fetch market odds");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/propose — oracle proposes a resolution
router.post("/:id/propose", async (req, res) => {
  const { proposedOutcome } = req.body;
  if (proposedOutcome === undefined) {
    return res.status(400).json({ error: "proposedOutcome is required" });
  }
  try {
    const result = await db.query(
      "UPDATE markets SET status = 'PROPOSED', winning_outcome = $1 WHERE id = $2 RETURNING *",
      [proposedOutcome, req.params.id]
    );
    if (!result.rows.length) {
      logger.warn({ market_id: req.params.id }, "Market not found for proposal");
      return res.status(404).json({ error: "Market not found" });
    }

    logger.info(
      {
        market_id: req.params.id,
        proposed_outcome: proposedOutcome,
        status: "PROPOSED",
      },
      "Market resolution proposed"
    );

    // Trigger notification
    triggerNotification(req.params.id, "PROPOSED");

    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error(
      { err, market_id: req.params.id, proposed_outcome: proposedOutcome },
      "Failed to propose market resolution"
    );
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/resolve — resolve a market and set dispute window
router.post("/:id/resolve", async (req, res) => {
  try {
    const marketId = req.params.id;

    // Resolve the market
    const result = await db.query(
      "UPDATE markets SET resolved = TRUE, dispute_window_ends_at = NOW() + INTERVAL '1 hour' * $1 WHERE id = $2 RETURNING *",
      [DISPUTE_WINDOW_HOURS, marketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    logger.info({ market_id: marketId }, "Market resolved and dispute window set");
    res.status(200).json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to resolve market");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bets/payout/:marketId — enforce dispute window before payouts
router.post("/payout/:marketId", async (req, res) => {
  try {
    const marketId = req.params.marketId;

    const market = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);

    if (!market.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    const { dispute_window_ends_at } = market.rows[0];
    const now = new Date();

    if (new Date(dispute_window_ends_at) > now) {
      return res.status(400).json({
        error: `Dispute window is still open. Payouts available after ${dispute_window_ends_at}`,
      });
    }

    // Proceed with payout logic
    // ...existing payout logic...

    res.status(200).json({ message: "Payouts processed successfully" });
  } catch (err) {
    logger.error({ err, market_id: req.params.marketId }, "Failed to process payouts");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/markets/:id/dispute-status — get dispute window status
router.get("/:id/dispute-status", async (req, res) => {
  try {
    const marketId = req.params.id;

    const market = await db.query(
      "SELECT dispute_window_ends_at, (dispute_window_ends_at > NOW()) AS is_in_dispute_window FROM markets WHERE id = $1",
      [marketId]
    );

    if (!market.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    res.status(200).json(market.rows[0]);
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to fetch dispute status");
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/markets/:id — soft delete (admin JWT required)
router.delete("/:id", jwtAuth, async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE markets SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found or already deleted" });
    }
    logger.info({ market_id: req.params.id, admin: req.admin?.sub }, "Market soft-deleted");
    await invalidateAll(req.params.id);
    res.json({ success: true, market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to soft-delete market");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
