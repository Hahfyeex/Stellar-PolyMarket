const express = require("express");
const router = express.Router();
const db = require("../db");

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

    res.status(201).json({ bet: bet.rows[0] });
  } catch (err) {
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

    res.json({ payouts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
