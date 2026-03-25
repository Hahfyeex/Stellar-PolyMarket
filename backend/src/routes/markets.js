const express = require("express");
const router = express.Router();
const db = require("../db");
const { triggerNotification } = require("../utils/notifications");
const logger = require("../utils/logger");
const { 
  validateMarketCreation, 
  rateLimitMarketCreation 
} = require("../middleware/marketValidation");
const redis = require("../utils/redis");
const { calculateOdds } = require("../utils/math");

// GET /api/markets — list all markets
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM markets ORDER BY created_at DESC"
    );
    logger.debug({ market_count: result.rows.length }, "Markets fetched");
    res.json({ markets: result.rows });
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
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'question, endDate, outcomes, and walletAddress are required',
        details: {
          question: !!question,
          endDate: !!endDate,
          outcomes: !!outcomes?.length,
          walletAddress: !!walletAddress
        }
      }
    });
  }
  
  try {
    // Market has passed all validation checks - create immediately without admin approval
    const result = await db.query(
      "INSERT INTO markets (question, end_date, outcomes, contract_address, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [question, endDate, outcomes, contractAddress || null]
    );
    
    logger.info({
      market_id: result.rows[0].id,
      question,
      wallet_address: walletAddress,
      contract_address: contractAddress,
      outcomes_count: outcomes.length,
      permissionless: true
    }, "Market created via permissionless launch");
    
    // Return 201 Created with the new market
    res.status(201).json({ 
      market: result.rows[0],
      message: "Market created successfully and published immediately"
    });
  } catch (err) {
    logger.error({ err, question, wallet_address: walletAddress }, "Failed to create market");
    res.status(500).json({ 
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create market',
        details: err.message
      }
    });
  }
});

const { calculateConfidenceScore } = require("../utils/analytics");
// GET /api/markets/:id
router.get("/:id", async (req, res) => {
  try {
    const market = await db.query("SELECT * FROM markets WHERE id = $1", [req.params.id]);
    if (!market.rows.length) {
      logger.warn({ market_id: req.params.id }, "Market not found");
      return res.status(404).json({ error: "Market not found" });
    }

    const betsResult = await db.query("SELECT * FROM bets WHERE market_id = $1", [req.params.id]);
    const bets = betsResult.rows;
    const confidenceScore = calculateConfidenceScore(bets);

    logger.debug({
      market_id: req.params.id,
      bets_count: bets.length,
      confidence_score: confidenceScore,
    }, "Market details fetched with confidence score");

    res.json({
      market: {
        ...market.rows[0],
        confidence_score: confidenceScore,
      },
      bets,
    });
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
    const marketResult = await db.query("SELECT * FROM markets WHERE id = $1", [marketId]);
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
      const b = betsResult.rows.find(row => parseInt(row.outcome_index) === i);
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
    
    logger.info({
      market_id: req.params.id,
      proposed_outcome: proposedOutcome,
      status: "PROPOSED",
    }, "Market resolution proposed");
    
    // Trigger notification
    triggerNotification(req.params.id, "PROPOSED");

    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id, proposed_outcome: proposedOutcome }, "Failed to propose market resolution");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/resolve — oracle triggers final resolution
router.post("/:id/resolve", async (req, res) => {
  const { winningOutcome } = req.body;
  if (winningOutcome === undefined) {
    return res.status(400).json({ error: "winningOutcome is required" });
  }
  try {
    const result = await db.query(
      "UPDATE markets SET resolved = TRUE, status = 'RESOLVED', winning_outcome = $1 WHERE id = $2 RETURNING *",
      [winningOutcome, req.params.id]
    );
    if (!result.rows.length) {
      logger.warn({ market_id: req.params.id }, "Market not found for resolution");
      return res.status(404).json({ error: "Market not found" });
    }
    
    logger.info({
      market_id: req.params.id,
      winning_outcome: winningOutcome,
      status: "RESOLVED",
    }, "Market resolved");
    
    // Trigger notification
    triggerNotification(req.params.id, "RESOLVED");

    res.json({ market: result.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: req.params.id, winning_outcome: winningOutcome }, "Failed to resolve market");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
