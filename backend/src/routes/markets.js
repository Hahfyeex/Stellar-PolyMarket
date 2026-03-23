const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/markets — list all markets
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM markets ORDER BY created_at DESC"
    );
    res.json({ markets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets — create a market
router.post("/", async (req, res) => {
  const { question, endDate, outcomes, contractAddress } = req.body;
  if (!question || !endDate || !outcomes?.length) {
    return res.status(400).json({ error: "question, endDate, and outcomes are required" });
  }
  try {
    const result = await db.query(
      "INSERT INTO markets (question, end_date, outcomes, contract_address) VALUES ($1, $2, $3, $4) RETURNING *",
      [question, endDate, outcomes, contractAddress || null]
    );
    res.status(201).json({ market: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/markets/:id
router.get("/:id", async (req, res) => {
  try {
    const market = await db.query("SELECT * FROM markets WHERE id = $1", [req.params.id]);
    if (!market.rows.length) return res.status(404).json({ error: "Market not found" });

    const bets = await db.query("SELECT * FROM bets WHERE market_id = $1", [req.params.id]);
    res.json({ market: market.rows[0], bets: bets.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/markets/:id/resolve — oracle triggers resolution
router.post("/:id/resolve", async (req, res) => {
  const { winningOutcome } = req.body;
  if (winningOutcome === undefined) {
    return res.status(400).json({ error: "winningOutcome is required" });
  }
  try {
    const result = await db.query(
      "UPDATE markets SET resolved = TRUE, winning_outcome = $1 WHERE id = $2 RETURNING *",
      [winningOutcome, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Market not found" });
    res.json({ market: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
