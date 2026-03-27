const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");
const eventBus = require("../bots/eventBus");

const POOL_LOW_THRESHOLD = Number(process.env.DEPTH_BOT_THRESHOLD) || 50;

// POST /api/bets — place a bet
router.post("/", async (req, res) => {
  const { marketId, outcomeIndex, amount, walletAddress } = req.body;
  if (!marketId || outcomeIndex === undefined || !amount || !walletAddress) {
    return res.status(400).json({ error: "marketId, outcomeIndex, amount, and walletAddress are required" });
  }
  try {
    // Check market exists and is not resolved
    const market = await db.query(
      "SELECT * FROM markets WHERE id = $1 AND resolved = FALSE AND end_date > NOW()",
      [marketId]
    );
    if (!market.rows.length) {
      logger.warn({ market_id: marketId, wallet_address: walletAddress }, "Bet rejected: market not found, resolved, or expired");
      return res.status(400).json({ error: "Market not found, already resolved, or expired" });
    }

    // Record bet
    const bet = await db.query(
      "INSERT INTO bets (market_id, wallet_address, outcome_index, amount) VALUES ($1, $2, $3, $4) RETURNING *",
      [marketId, walletAddress, outcomeIndex, amount]
    );

    // Update total pool
    await db.query(
      "UPDATE markets SET total_pool = total_pool + $1 WHERE id = $2",
      [amount, marketId]
    );

    logger.info({
      bet_id: bet.rows[0].id,
      market_id: marketId,
      wallet_address: walletAddress,
      outcome_index: outcomeIndex,
      amount,
    }, "Bet placed");

    // Fetch updated pool and emit pool.low if depth has fallen below threshold
    const poolResult = await db.query("SELECT total_pool FROM markets WHERE id = $1", [marketId]);
    const totalPool = parseFloat(poolResult.rows[0]?.total_pool ?? 0);
    if (totalPool < POOL_LOW_THRESHOLD) {
      eventBus.emit("pool.low", { marketId, totalPool, threshold: POOL_LOW_THRESHOLD });
    }

    res.status(201).json({ bet: bet.rows[0] });
  } catch (err) {
    logger.error({ err, market_id: marketId, wallet_address: walletAddress }, "Failed to place bet");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bets/payout/:marketId — distribute rewards to winners
router.post("/payout/:marketId", async (req, res) => {
  try {
    const market = await db.query(
      "SELECT * FROM markets WHERE id = $1 AND resolved = TRUE",
      [req.params.marketId]
    );
    if (!market.rows.length) {
      logger.warn({ market_id: req.params.marketId }, "Payout rejected: market not resolved");
      return res.status(400).json({ error: "Market not resolved yet" });
    }

    const { winning_outcome, total_pool } = market.rows[0];

    // Get all winning bets
    const winners = await db.query(
      "SELECT * FROM bets WHERE market_id = $1 AND outcome_index = $2 AND paid_out = FALSE",
      [req.params.marketId, winning_outcome]
    );

    // Convert all monetary values to BigInt stroops (1 XLM = 10,000,000 stroops)
    const totalPoolStroops = BigInt(Math.round(parseFloat(total_pool) * 10_000_000));
    
    // Calculate payout pool after 3% fee (97% of total)
    const payoutPool = (totalPoolStroops * 97n) / 100n;

    // Calculate total winning stake in stroops
    let winningStakeStroops = 0n;
    for (const bet of winners.rows) {
      const betStroops = BigInt(Math.round(parseFloat(bet.amount) * 10_000_000));
      winningStakeStroops += betStroops;
    }

    if (winningStakeStroops === 0n) {
      logger.warn({ market_id: req.params.marketId }, "No winning stake found");
      return res.status(400).json({ error: "No winning stake found" });
    }

    // Calculate payouts using BigInt arithmetic
    const payouts = winners.rows.map((bet) => {
      const betAmountStroops = BigInt(Math.round(parseFloat(bet.amount) * 10_000_000));
      const payoutStroops = (betAmountStroops * payoutPool) / winningStakeStroops;
      const payoutXlm = (Number(payoutStroops) / 10_000_000).toFixed(7);
      return { wallet: bet.wallet_address, payout: payoutXlm };
    });

    // Verify sum of payouts doesn't exceed payout pool
    let totalPayoutStroops = 0n;
    for (const payout of payouts) {
      const payoutStroops = BigInt(Math.round(parseFloat(payout.payout) * 10_000_000));
      totalPayoutStroops += payoutStroops;
    }

    if (totalPayoutStroops > payoutPool) {
      logger.error({
        market_id: req.params.marketId,
        total_payout_stroops: totalPayoutStroops.toString(),
        payout_pool_stroops: payoutPool.toString(),
      }, "Payout sum exceeds pool");
      return res.status(500).json({ error: "Payout calculation error: sum exceeds pool" });
    }

    // Mark bets as paid
    await db.query(
      "UPDATE bets SET paid_out = TRUE WHERE market_id = $1 AND outcome_index = $2",
      [req.params.marketId, winning_outcome]
    );

    logger.info({
      market_id: req.params.marketId,
      winning_outcome,
      winners_count: winners.rows.length,
      total_pool,
      winning_stake_stroops: winningStakeStroops.toString(),
      payout_pool_stroops: payoutPool.toString(),
      total_payout_stroops: totalPayoutStroops.toString(),
    }, "Payouts distributed");

    res.json({ payouts });
  } catch (err) {
    logger.error({ err, market_id: req.params.marketId }, "Failed to distribute payouts");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bets/recent — recent activity feed (indexer)
router.get("/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const result = await db.query(
      `SELECT b.id, b.wallet_address, b.outcome_index, b.amount, b.created_at,
              m.question, m.outcomes
       FROM bets b
       JOIN markets m ON m.id = b.market_id
       ORDER BY b.created_at DESC
       LIMIT $1`,
      [limit]
    );
    logger.debug({ activity_count: result.rows.length, limit }, "Recent activity fetched");
    res.json({ activity: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch recent activity");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bets/my-positions — paginated user positions
router.get("/my-positions", async (req, res) => {
  const { walletAddress, cursor } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  try {
    const cursorId = cursor ? parseInt(cursor) : null;
    const query = `
      SELECT b.id, b.market_id, b.outcome_index, b.amount, b.created_at, b.paid_out,
             m.question, m.status as market_status, m.resolved
      FROM bets b
      JOIN markets m ON m.id = b.market_id
      WHERE b.wallet_address = $1
        AND ($2::integer IS NULL OR b.id < $2)
      ORDER BY b.id DESC
      LIMIT $3
    `;

    const result = await db.query(query, [walletAddress, cursorId, limit]);
    const bets = result.rows;
    const nextCursor = bets.length > 0 ? bets[bets.length - 1].id : null;

    logger.info({
      wallet_address: walletAddress,
      bets_count: bets.length,
      next_cursor: nextCursor,
    }, "User positions fetched");

    res.json({
      positions: bets,
      next_cursor: nextCursor,
      limit,
    });
  } catch (err) {
    logger.error({ err, wallet_address: walletAddress }, "Failed to fetch user positions");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
