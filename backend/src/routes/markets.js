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
const { getOrSet, invalidateAll, listKey, TTL } = require("../utils/cache");
const { getFeeRateBps } = require("../utils/sorobanClient");
const jwtAuth = require("../middleware/jwtAuth");

const DISPUTE_WINDOW_HOURS = parseInt(process.env.DISPUTE_WINDOW_HOURS, 10) || 24;

const ACTION_LABELS = {
  PROPOSED: "Resolution Proposed",
  CONFIRMED: "Resolution Confirmed",
  REJECTED: "Resolution Rejected",
  DISPUTED: "Resolution Disputed",
};

async function recordResolutionHistory(marketId, action, actorWallet, outcomeIndex, notes) {
  await db.query(
    "INSERT INTO market_resolution_history (market_id, action, actor_wallet, outcome_index, notes) VALUES ($1, $2, $3, $4, $5)",
    [marketId, action, actorWallet || null, outcomeIndex ?? null, notes || null]
  );
}

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

    // Category filter: slug
    const categorySlug = req.query.category;

    // Cache-aside: check Redis first, fall back to DB on miss or Redis failure
    // Include categorySlug in cache key if present
    const key = categorySlug
      ? `markets:cat:${categorySlug}:${limit}:${offset}`
      : listKey(limit, offset);
    const data = await getOrSet(key, TTL.LIST, async () => {
      // Cache miss — query the database
      let countQuery =
        "SELECT COUNT(*) as total FROM markets m WHERE m.deleted_at IS NULL AND m.status != 'EXPIRED'";
      let dataQuery =
        "SELECT m.*, c.slug as category_slug FROM markets m LEFT JOIN categories c ON m.category_id = c.id WHERE m.deleted_at IS NULL AND m.status != 'EXPIRED'";
      const params = [limit, offset];

      if (categorySlug) {
        countQuery =
          "SELECT COUNT(*) as total FROM markets m JOIN categories c ON m.category_id = c.id WHERE m.deleted_at IS NULL AND m.status != 'EXPIRED' AND c.slug = $1";
        dataQuery =
          "SELECT m.*, c.slug as category_slug FROM markets m JOIN categories c ON m.category_id = c.id WHERE m.deleted_at IS NULL AND m.status != 'EXPIRED' AND c.slug = $3 ORDER BY m.created_at DESC LIMIT $1 OFFSET $2";
        params.push(categorySlug);
      } else {
        dataQuery += " ORDER BY m.created_at DESC LIMIT $1 OFFSET $2";
      }

      const countResult = await db.query(countQuery, categorySlug ? [categorySlug] : []);
      const total = parseInt(countResult.rows[0].total, 10);

      const result = await db.query(dataQuery, params);

      const markets = result.rows;
      const hasMore = offset + markets.length < total;

      logger.debug(
        { market_count: markets.length, total, limit, offset, categorySlug },
        "Markets fetched with pagination and filtering"
      );

      return { markets, meta: { total, limit, offset, hasMore, category: categorySlug || null } };
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
  const { question, endDate, outcomes, contractAddress, walletAddress, categoryId } = req.body;

  // Basic required field validation (middleware handles detailed validation)
  if (!question || !endDate || !outcomes?.length || !walletAddress || !categoryId) {
    return res.status(400).json({
      error: {
        code: "MISSING_REQUIRED_FIELDS",
        message: "question, endDate, outcomes, walletAddress, and categoryId are required",
        details: {
          question: !!question,
          endDate: !!endDate,
          outcomes: !!outcomes?.length,
          walletAddress: !!walletAddress,
          categoryId: !!categoryId,
        },
      },
    });
  }

  try {
    const feeRateBps = await getFeeRateBps();

    // Market has passed all validation checks - create immediately without admin approval
    const result = await db.query(
      "INSERT INTO markets (question, end_date, outcomes, contract_address, category_id, fee_rate_bps, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
      [question, endDate, outcomes, contractAddress || null, categoryId, feeRateBps]
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
    const cacheKey = `market:detail:${req.params.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const marketResult = await db.query(
      "SELECT * FROM markets WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!marketResult.rows.length) {
      logger.warn({ market_id: req.params.id }, "Market not found");
      return res.status(404).json({ error: "Market not found" });
    }

    const betsResult = await db.query("SELECT * FROM bets WHERE market_id = $1", [req.params.id]);
    const bets = betsResult.rows;
    const confidenceScore = calculateConfidenceScore(bets);

    // Aggregation by outcome (#609)
    const aggResult = await db.query(
      `SELECT outcome_index, COUNT(*) AS bet_count, SUM(amount) AS total_pool
       FROM bets WHERE market_id = $1 GROUP BY outcome_index`,
      [req.params.id]
    );
    const market = marketResult.rows[0];
    const outcomes = market.outcomes || [];
    const marketTotalPool = aggResult.rows.reduce((s, r) => s + parseFloat(r.total_pool || 0), 0);
    const outcomes_summary = outcomes.map((label, idx) => {
      const row = aggResult.rows.find((r) => parseInt(r.outcome_index) === idx);
      const total_pool = row ? parseFloat(row.total_pool) : 0;
      const bet_count = row ? parseInt(row.bet_count) : 0;
      const implied_probability = marketTotalPool > 0 ? (total_pool / marketTotalPool) * 100 : 0;
      return { outcome_index: idx, label, total_pool, bet_count, implied_probability };
    });

    logger.debug(
      { market_id: req.params.id, bets_count: bets.length, confidence_score: confidenceScore },
      "Market details fetched"
    );

    const data = {
      market: { ...market, confidence_score: confidenceScore },
      bets,
      outcomes_summary,
    };
    await redis.set(cacheKey, JSON.stringify(data), "EX", 5);
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
  const { proposedOutcome, actorWallet } = req.body;
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

    await recordResolutionHistory(req.params.id, "PROPOSED", actorWallet, proposedOutcome);

    logger.info(
      { market_id: req.params.id, proposed_outcome: proposedOutcome },
      "Market resolution proposed"
    );
    triggerNotification(req.params.id, "PROPOSED");
    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to propose market resolution");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/confirm — confirm a proposed resolution
router.post("/:id/confirm", async (req, res) => {
  const { actorWallet } = req.body;
  try {
    const result = await db.query(
      "UPDATE markets SET status = 'CONFIRMED', resolved = TRUE WHERE id = $1 AND status = 'PROPOSED' RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found or not in PROPOSED state" });
    }

    await recordResolutionHistory(
      req.params.id,
      "CONFIRMED",
      actorWallet,
      result.rows[0].winning_outcome
    );

    logger.info({ market_id: req.params.id }, "Market resolution confirmed");
    triggerNotification(req.params.id, "CONFIRMED");
    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to confirm market resolution");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/reject — reject a proposed resolution
router.post("/:id/reject", async (req, res) => {
  const { actorWallet, notes } = req.body;
  try {
    const result = await db.query(
      "UPDATE markets SET status = 'ACTIVE', winning_outcome = NULL WHERE id = $1 AND status = 'PROPOSED' RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found or not in PROPOSED state" });
    }

    await recordResolutionHistory(req.params.id, "REJECTED", actorWallet, null, notes);

    logger.info({ market_id: req.params.id }, "Market resolution rejected");
    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to reject market resolution");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/dispute — dispute a proposed resolution
router.post("/:id/dispute", async (req, res) => {
  const { actorWallet, notes } = req.body;
  try {
    const result = await db.query(
      "UPDATE markets SET status = 'DISPUTED' WHERE id = $1 AND status = 'PROPOSED' RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found or not in PROPOSED state" });
    }

    await recordResolutionHistory(
      req.params.id,
      "DISPUTED",
      actorWallet,
      result.rows[0].winning_outcome,
      notes
    );

    logger.info({ market_id: req.params.id }, "Market resolution disputed");
    triggerNotification(req.params.id, "DISPUTED");
    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to dispute market resolution");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/markets/:id/history — public resolution history
router.get("/:id/history", async (req, res) => {
  try {
    const marketCheck = await db.query(
      "SELECT id FROM markets WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!marketCheck.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    const result = await db.query(
      "SELECT id, action, actor_wallet, outcome_index, notes, created_at FROM market_resolution_history WHERE market_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );

    const history = result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      action_label: ACTION_LABELS[row.action] || row.action,
      actor_wallet: row.actor_wallet
        ? `${row.actor_wallet.slice(0, 4)}...${row.actor_wallet.slice(-4)}`
        : null,
      outcome_index: row.outcome_index,
      notes: row.notes,
      created_at: row.created_at,
    }));

    res.json({ market_id: parseInt(req.params.id, 10), history });
  } catch (err) {
    logger.error({ err, market_id: req.params.id }, "Failed to fetch resolution history");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/resolve — resolve a market and set dispute window
router.post("/:id/resolve", async (req, res) => {
  try {
    const marketId = req.params.id;
    const { actorWallet, winningOutcome } = req.body;

    const result = await db.query(
      "UPDATE markets SET resolved = TRUE, dispute_window_ends_at = NOW() + INTERVAL '1 hour' * $1 WHERE id = $2 RETURNING *",
      [DISPUTE_WINDOW_HOURS, marketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    await recordResolutionHistory(
      marketId,
      "CONFIRMED",
      actorWallet,
      winningOutcome ?? result.rows[0].winning_outcome
    );

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
