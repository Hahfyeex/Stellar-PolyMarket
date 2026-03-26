/**
 * routes/tokens.js
 *
 * Secondary Market — Position Token Price Aggregator
 *
 * GET /api/tokens/:token_id/price
 *   Returns the 24-hour VWAP price for a position token derived from
 *   indexed Mint/Burn events.
 *
 *   token_id format: "<market_id>-<outcome_index>"  e.g. "42-0"
 *
 * Response:
 *   { token_id: "42-0", current_value: "0.85 XLM" }
 */

"use strict";

const express = require("express");
const router = express.Router();
const db = require("../db");
const { calculateVWAP } = require("../utils/vwap");
const logger = require("../utils/logger");

const TOKEN_ID_RE = /^\d+-\d+$/;
const WINDOW_HOURS = 24;

/**
 * GET /api/tokens/:token_id/price
 */
router.get("/:token_id/price", async (req, res) => {
  const { token_id } = req.params;

  if (!TOKEN_ID_RE.test(token_id)) {
    return res.status(400).json({
      error: "Invalid token_id format. Expected '<market_id>-<outcome_index>' e.g. '42-0'",
    });
  }

  try {
    const result = await db.query(
      `SELECT price_xlm, volume
         FROM token_trades
        WHERE token_id = $1
          AND created_at >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
        ORDER BY created_at DESC`,
      [token_id]
    );

    const trades = result.rows;
    const vwap = calculateVWAP(trades);

    logger.info(
      { token_id, trade_count: trades.length, vwap },
      "Token price requested"
    );

    return res.json({
      token_id,
      current_value: `${vwap.toFixed(7)} XLM`,
      trade_count: trades.length,
      window_hours: WINDOW_HOURS,
    });
  } catch (err) {
    logger.error({ err, token_id }, "Failed to fetch token price");
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
