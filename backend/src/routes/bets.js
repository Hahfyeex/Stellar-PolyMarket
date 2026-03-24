const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");

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

    // Get total winning stake
    const winningStake = winners.rows.reduce((sum, b) => sum + parseFloat(b.amount), 0);

    const payouts = winners.rows.map((bet) => {
      const share = parseFloat(bet.amount) / winningStake;
      const payout = share * parseFloat(total_pool) * 0.97; // 3% platform fee
      return { wallet: bet.wallet_address, payout: payout.toFixed(7) };
    });

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
      winning_stake: winningStake,
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

module.exports = router;
