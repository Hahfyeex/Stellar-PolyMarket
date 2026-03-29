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

    // #376: Check for duplicate bet from same wallet on same market
    const existingBet = await db.query(
      "SELECT id FROM bets WHERE market_id = $1 AND wallet_address = $2",
      [marketId, walletAddress]
    );
    if (existingBet.rows.length > 0) {
      logger.warn({ market_id: marketId, wallet_address: walletAddress }, "Bet rejected: wallet has already placed a bet on this market");
      return res.status(409).json({ error: "Wallet has already placed a bet on this market" });
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
  const marketId = req.params.marketId;
  let client;
  let inTransaction = false;

  try {
    client = await db.connect();
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const market = await client.query(
      "SELECT id, winning_outcome, total_pool FROM markets WHERE id = $1 AND resolved = TRUE FOR UPDATE",
      [marketId]
    );
    if (!market.rows.length) {
      await client.query("ROLLBACK");
      inTransaction = false;
      logger.warn({ market_id: marketId }, "Payout rejected: market not resolved");
      return res.status(400).json({ error: "Market not resolved yet" });
    }

    const { winning_outcome, total_pool } = market.rows[0];
    const lockedWinners = await client.query(
      "SELECT id, wallet_address, amount, paid_out FROM bets WHERE market_id = $1 AND outcome_index = $2 FOR UPDATE",
      [marketId, winning_outcome]
    );

    const winners = lockedWinners.rows.filter((row) => row.paid_out === false);
    const alreadyPaid = lockedWinners.rows.filter((row) => row.paid_out === true);
    for (const bet of alreadyPaid) {
      logger.warn({ market_id: marketId, bet_id: bet.id }, "Skipping payout row already marked as paid_out");
    }

    const totalPoolStroops = BigInt(Math.floor(parseFloat(total_pool) * 1e7));
    const winningStakeStroops = winners.reduce((sum, b) => {
      return sum + BigInt(Math.floor(parseFloat(b.amount) * 1e7));
    }, 0n);

    if (winningStakeStroops === 0n) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(400).json({ error: "No winning stake" });
    }

    const payoutPoolStroops = (totalPoolStroops * 97n) / 100n;
    const payouts = winners.map((bet) => {
      const betAmountStroops = BigInt(Math.floor(parseFloat(bet.amount) * 1e7));
      const payoutStroops = (betAmountStroops * payoutPoolStroops) / winningStakeStroops;
      const payoutXlm = Number(payoutStroops) / 1e7;
      return { betId: bet.id, wallet: bet.wallet_address, payout: payoutXlm.toFixed(7) };
    });

    let totalPayoutStroops = 0n;
    for (const payout of payouts) {
      const payoutStroops = BigInt(Math.round(parseFloat(payout.payout) * 10_000_000));
      totalPayoutStroops += payoutStroops;
    }

    if (totalPayoutStroops > payoutPoolStroops) {
      logger.error({
        market_id: marketId,
        total_payout_stroops: totalPayoutStroops.toString(),
        payout_pool_stroops: payoutPoolStroops.toString(),
      }, "Payout sum exceeds pool");
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(500).json({ error: "Payout calculation error: sum exceeds pool" });
    }

    const winnerIds = winners.map((w) => w.id);
    const markedPaid = await client.query(
      "UPDATE bets SET paid_out = TRUE WHERE id = ANY($1::int[]) AND paid_out = FALSE RETURNING id, wallet_address",
      [winnerIds]
    );
    const markedPaidIds = new Set(markedPaid.rows.map((row) => row.id));
    const committedPayouts = payouts
      .filter((p) => markedPaidIds.has(p.betId))
      .map(({ wallet, payout }) => ({ wallet, payout }));

    await client.query("COMMIT");
    inTransaction = false;

    logger.info({
      market_id: marketId,
      winning_outcome,
      winners_count: committedPayouts.length,
      total_pool,
      winning_stake: Number(winningStakeStroops) / 1e7,
    }, "Payouts distributed");

    res.json({ payouts: committedPayouts });
  } catch (err) {
    if (client && inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        logger.error({ err: rollbackErr, market_id: marketId }, "Payout rollback failed");
      }
    }
    if (err?.code === "40001") {
      logger.warn({ market_id: marketId }, "Payout serialization conflict");
      return res.status(409).json({ error: "Concurrent payout conflict, please retry" });
    }
    logger.error({ err, market_id: marketId }, "Failed to distribute payouts");
    res.status(500).json({ error: err.message });
  } finally {
    if (client) {
      client.release();
    }
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
