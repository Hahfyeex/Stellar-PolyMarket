const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");

// GET /api/whitelisted-tokens — list all whitelisted tokens
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT token_address, symbol, added_at FROM whitelisted_tokens ORDER BY added_at ASC"
    );
    logger.debug({ count: result.rows.length }, "Whitelisted tokens fetched");
    res.json({ tokens: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch whitelisted tokens");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whitelisted-tokens — add a token to the whitelist (admin)
router.post("/", async (req, res) => {
  const { tokenAddress, symbol } = req.body;
  if (!tokenAddress) {
    return res.status(400).json({ error: "tokenAddress is required" });
  }
  try {
    const result = await db.query(
      "INSERT INTO whitelisted_tokens (token_address, symbol) VALUES ($1, $2) ON CONFLICT (token_address) DO NOTHING RETURNING *",
      [tokenAddress, symbol || null]
    );
    if (!result.rows.length) {
      logger.warn({ token_address: tokenAddress }, "Token already whitelisted");
      return res.status(409).json({ error: "Token already whitelisted" });
    }
    logger.info({ token_address: tokenAddress, symbol }, "Token whitelisted");
    res.status(201).json({ token: result.rows[0] });
  } catch (err) {
    logger.error({ err, token_address: tokenAddress }, "Failed to whitelist token");
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/whitelisted-tokens/:tokenAddress — remove a token from the whitelist (admin)
router.delete("/:tokenAddress", async (req, res) => {
  try {
    const result = await db.query(
      "DELETE FROM whitelisted_tokens WHERE token_address = $1 RETURNING *",
      [req.params.tokenAddress]
    );
    if (!result.rows.length) {
      logger.warn({ token_address: req.params.tokenAddress }, "Token not found in whitelist");
      return res.status(404).json({ error: "Token not found in whitelist" });
    }
    logger.info({ token_address: req.params.tokenAddress }, "Token removed from whitelist");
    res.json({ removed: result.rows[0] });
  } catch (err) {
    logger.error(
      { err, token_address: req.params.tokenAddress },
      "Failed to remove token from whitelist"
    );
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whitelisted-tokens/check/:tokenAddress — check if a token is whitelisted
router.get("/check/:tokenAddress", async (req, res) => {
  try {
    const result = await db.query("SELECT 1 FROM whitelisted_tokens WHERE token_address = $1", [
      req.params.tokenAddress,
    ]);
    res.json({ whitelisted: result.rows.length > 0 });
  } catch (err) {
    logger.error(
      { err, token_address: req.params.tokenAddress },
      "Failed to check token whitelist status"
    );
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
